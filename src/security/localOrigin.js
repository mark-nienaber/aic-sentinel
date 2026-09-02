const LOCAL_HOST = '127.0.0.1';

function isLoopbackRemoteAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isAllowedOrigin(origin, port) {
  if (!origin) return false;

  try {
    const url = new URL(origin);
    const originPort = Number(url.port || (url.protocol === 'https:' ? 443 : 80));

    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      originPort === Number(port);
  } catch {
    return false;
  }
}

function isAllowedHttpRequest(origin, remoteAddress, port) {
  return isLoopbackRemoteAddress(remoteAddress) && (!origin || isAllowedOrigin(origin, port));
}

function requireLocalOrigin(req, res, next) {
  if (!isAllowedHttpRequest(req.get('origin'), req.socket.remoteAddress, req.socket.localPort)) {
    return res.status(403).json({ error: 'AIC Sentinel accepts requests only from its local browser UI' });
  }

  next();
}

function buildContentSecurityPolicy(port) {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}`,
    "img-src 'self' data:",
    "style-src 'self'",
    "script-src 'self' 'unsafe-eval'"
  ].join('; ');
}

module.exports = {
  LOCAL_HOST,
  isAllowedOrigin,
  isAllowedHttpRequest,
  isLoopbackRemoteAddress,
  requireLocalOrigin,
  buildContentSecurityPolicy
};
