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

function requireLocalOrigin(req, res, next) {
  if (!isLoopbackRemoteAddress(req.socket.remoteAddress) || !isAllowedOrigin(req.get('origin'), req.socket.localPort)) {
    return res.status(403).json({ error: 'AIC Sentinel accepts requests only from its local browser UI' });
  }

  next();
}

module.exports = { LOCAL_HOST, isAllowedOrigin, isLoopbackRemoteAddress, requireLocalOrigin };
