const https = require('https');
const { URL } = require('url');

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const REQUEST_TIMEOUT_MS = 30000;

class LogClient {
  constructor({ origin, apiKey, apiSecret, lookup, customHeaders = {} }) {
    if (!origin || typeof lookup !== 'function') {
      throw new Error('LogClient requires a prevalidated origin and pinned DNS lookup');
    }

    this.origin = origin.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.lookup = lookup;
    this.customHeaders = customHeaders;

    // Reuse TCP+TLS connections across requests
    this._agent = new https.Agent({ keepAlive: true, maxSockets: 2 });
  }

  _buildHeaders() {
    return {
      ...this.customHeaders,
      // Auth headers set last so custom headers cannot override them
      'x-api-key': this.apiKey,
      'x-api-secret': this.apiSecret,
    };
  }

  _request(path, signal) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let settled = false;
      const settle = (fn, value) => {
        if (!settled) { settled = true; fn(value); }
      };

      const url = new URL(path, this.origin);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: this._buildHeaders(),
        agent: this._agent,
        lookup: this.lookup
      };

      // Full lifecycle timeout (covers connect + response body)
      const timeout = setTimeout(() => {
        req.destroy();
        settle(reject, { error: 'Request timeout' });
      }, REQUEST_TIMEOUT_MS);

      const req = https.request(options, (res) => {
        const rateLimitHeaders = {
          limit: parseInt(res.headers['x-ratelimit-limit']) || 0,
          remaining: parseInt(res.headers['x-ratelimit-remaining']) || 0,
          reset: parseInt(res.headers['x-ratelimit-reset']) || 0
        };

        // Buffer-based accumulation (more efficient than string concat)
        const chunks = [];
        let totalSize = 0;

        res.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > MAX_RESPONSE_SIZE) {
            req.destroy();
            settle(reject, { error: 'Response too large (>10MB)' });
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          clearTimeout(timeout);
          const data = Buffer.concat(chunks).toString('utf8');

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = { error: 'Invalid JSON response' };
          }

          // Handle 429 rate limiting explicitly
          if (res.statusCode === 429) {
            const retryAfter = parseInt(res.headers['retry-after']) || 60;
            settle(reject, {
              statusCode: 429,
              retryAfter,
              data: parsed,
              rateLimit: rateLimitHeaders,
              durationMs: Date.now() - startTime
            });
            return;
          }

          if (res.statusCode >= 400) {
            settle(reject, {
              statusCode: res.statusCode,
              data: parsed,
              rateLimit: rateLimitHeaders,
              durationMs: Date.now() - startTime
            });
            return;
          }

          settle(resolve, { data: parsed, rateLimit: rateLimitHeaders, statusCode: res.statusCode, durationMs: Date.now() - startTime });
        });
      });

      req.on('error', (e) => {
        clearTimeout(timeout);
        if (e.code === 'ABORT_ERR' || e.message === 'aborted') return;
        settle(reject, { error: e.message });
      });

      // Support aborting in-flight requests (used by TailManager on WebSocket close)
      if (signal) {
        if (signal.aborted) {
          req.destroy();
          clearTimeout(timeout);
          return;
        }
        signal.addEventListener('abort', () => {
          req.destroy();
          clearTimeout(timeout);
        }, { once: true });
      }

      req.end();
    });
  }

  async tail(source, cookie, signal) {
    let path = `/monitoring/logs/tail?source=${encodeURIComponent(source)}`;
    if (cookie) {
      path += `&_pagedResultsCookie=${encodeURIComponent(cookie)}`;
    }
    return this._request(path, signal);
  }

  async query({ source, beginTime, endTime, transactionId, queryFilter, cookie }) {
    const params = new URLSearchParams();
    params.set('source', source);
    if (beginTime) params.set('beginTime', beginTime);
    if (endTime) params.set('endTime', endTime);
    if (transactionId) params.set('transactionId', transactionId);
    if (queryFilter) params.set('_queryFilter', queryFilter);
    if (cookie) params.set('_pagedResultsCookie', cookie);
    return this._request(`/monitoring/logs?${params.toString()}`);
  }

  async testConnection() {
    return this.tail('am-everything', null);
  }

  destroy() {
    if (this._agent) {
      this._agent.destroy();
      this._agent = null;
    }
  }
}

module.exports = LogClient;
