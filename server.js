require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const connectionRoutes = require('./src/routes/connection');
const logRoutes = require('./src/routes/logs');
const TailManager = require('./src/ws/tailManager');
const CredentialStore = require('./src/credentials/credentialStore');
const TenantRegistry = require('./src/tenants/tenantRegistry');
const { validateAicOrigin } = require('./src/security/originPolicy');
const { createTenantClient } = require('./src/services/tenantClient');
const {
  LOCAL_HOST,
  isAllowedOrigin,
  isLoopbackRemoteAddress,
  requireLocalOrigin
} = require('./src/security/localOrigin');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const dependencies = {
  tenantRegistry: new TenantRegistry(),
  credentialStore: new CredentialStore(),
  validateOrigin: validateAicOrigin
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', requireLocalOrigin, connectionRoutes.createRouter(dependencies));
app.use('/api', requireLocalOrigin, logRoutes.createRouter(dependencies));

wss.on('connection', (ws) => {
  new TailManager(ws, {
    createTenantClient: ({ tenantId }) => createTenantClient({ tenantId, ...dependencies })
  });
});

server.on('upgrade', (req, socket, head) => {
  const port = server.address()?.port;
  let requestPath;
  try {
    requestPath = new URL(req.url, `http://${LOCAL_HOST}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (requestPath !== '/ws/tail' ||
      !isLoopbackRemoteAddress(req.socket.remoteAddress) || !isAllowedOrigin(req.headers.origin, port)) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, LOCAL_HOST, () => {
  console.log(`AIC Sentinel local-only service running at http://${LOCAL_HOST}:${PORT}`);
});
