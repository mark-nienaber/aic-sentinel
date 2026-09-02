const express = require('express');
const { createTenantClient } = require('../services/tenantClient');
const { validateAicOrigin } = require('../security/originPolicy');

const FORBIDDEN_CREDENTIAL_FIELDS = ['apiSecret', 'apiKey', 'origin', 'customHeaders'];

function createRouter({ tenantRegistry, credentialStore, validateOrigin = validateAicOrigin }) {
  const router = express.Router();

  router.get('/config', (_req, res) => {
    res.json({
      pollFrequency: parseInt(process.env.POLL_FREQUENCY, 10) || 10,
      maxLogBuffer: parseInt(process.env.MAX_LOG_BUFFER, 10) || 5000
    });
  });

  router.get('/sources', (_req, res) => res.json(require('../data/sources.json')));
  router.get('/categories', (_req, res) => res.json(require('../data/categories.json')));

  router.post('/logs/search', async (req, res) => {
    if (FORBIDDEN_CREDENTIAL_FIELDS.some((field) => Object.hasOwn(req.body || {}, field))) {
      return res.status(400).json({ error: 'Browser credentials and custom headers are not accepted' });
    }

    const { tenantId, source, beginTime, endTime, transactionId, queryFilter, cookie } = req.body || {};
    if (!tenantId) return res.status(400).json({ error: 'Missing tenantId' });

    let client;
    try {
      client = await createTenantClient({ tenantId, tenantRegistry, credentialStore, validateOrigin });
      const result = await client.query({ source, beginTime, endTime, transactionId, queryFilter, cookie });
      res.json(result.data);
    } catch (error) {
      const message = error.data ? `API error ${error.statusCode}: ${JSON.stringify(error.data)}` : (error.error || error.message || 'Search failed');
      res.status(400).json({ error: message });
    } finally {
      client?.destroy();
    }
  });

  return router;
}

module.exports = { createRouter };
