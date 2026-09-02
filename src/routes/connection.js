const express = require('express');
const LogClient = require('../api/logClient');
const { validateAicOrigin } = require('../security/originPolicy');
const { createTenantClient } = require('../services/tenantClient');

function connectionError(error) {
  const status = error.statusCode || 0;
  if (status === 401) return 'Invalid API key or secret (401 Unauthorized)';
  if (status === 403) return 'Access denied (403 Forbidden)';
  if (status === 404) return 'Endpoint not found — check tenant URL (should be https://your-tenant.forgeblocks.com)';
  if (status === 502) return 'Tenant returned 502 Bad Gateway — the tenant may be temporarily unavailable or the URL may be incorrect';
  if (status === 503) return 'Tenant returned 503 Service Unavailable — try again in a few seconds';
  if (status >= 500) return `Tenant returned ${status} Server Error — the tenant may be temporarily unavailable`;
  if (error.error) return error.error;
  if (error.data?.error === 'Invalid JSON response') return 'Unexpected response from tenant (got HTML instead of JSON) — check the tenant URL is correct';
  if (error.data) return JSON.stringify(error.data);
  return error.message || 'Connection failed';
}

function createRouter({ tenantRegistry, credentialStore, validateOrigin = validateAicOrigin }) {
  const router = express.Router();

  router.get('/tenants', (_req, res) => {
    res.json({ tenants: tenantRegistry.list(), keychain: credentialStore.isAvailable() });
  });

  router.post('/tenants', async (req, res) => {
    const { name, origin, apiKey, apiSecret, approveCustomDomain } = req.body || {};
    if (!origin || !apiKey || !apiSecret) {
      return res.status(400).json({ success: false, error: 'Missing required fields: origin, apiKey, apiSecret' });
    }

    try {
      const defaultValidation = await validateOrigin(origin);
      const hostname = new URL(defaultValidation.origin).hostname;
      const isDefaultDomain = hostname.endsWith('.forgeblocks.com') || hostname.endsWith('.id.forgerock.io');
      if (!isDefaultDomain && !approveCustomDomain) {
        return res.status(400).json({ success: false, error: 'Custom tenant domain requires explicit local approval' });
      }
      const safeOrigin = isDefaultDomain
        ? defaultValidation
        : await validateOrigin(origin, { approvedCustomDomains: [origin] });
      const client = new LogClient({ origin: safeOrigin.origin, lookup: safeOrigin.lookup, apiKey, apiSecret });
      try {
        await client.testConnection();
      } finally {
        client.destroy();
      }

      const tenant = tenantRegistry.save({
        name: name || hostname,
        origin: safeOrigin.origin,
        apiKeyId: apiKey,
        approvedCustomDomain: !isDefaultDomain
      });
      credentialStore.save(tenant.id, { apiKey, apiSecret });
      res.json({ success: true, tenant, keychain: credentialStore.isAvailable() });
    } catch (error) {
      res.status(400).json({ success: false, error: connectionError(error) });
    }
  });

  router.post('/tenants/:tenantId/test', async (req, res) => {
    let client;
    try {
      client = await createTenantClient({ tenantId: req.params.tenantId, tenantRegistry, credentialStore, validateOrigin });
      await client.testConnection();
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, error: connectionError(error) });
    } finally {
      client?.destroy();
    }
  });

  router.delete('/tenants/:tenantId', (req, res) => {
    const removed = tenantRegistry.remove(req.params.tenantId);
    credentialStore.remove(req.params.tenantId);
    res.json({ success: true, removed });
  });

  return router;
}

module.exports = { createRouter };
