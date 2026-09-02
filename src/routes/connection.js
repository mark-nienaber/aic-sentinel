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

function createRouter({ tenantRegistry, credentialStore, validateOrigin = validateAicOrigin, LogClientClass = LogClient }) {
  const router = express.Router();

  router.get('/tenants', (_req, res) => {
    res.json({ tenants: tenantRegistry.list(), keychain: credentialStore.isAvailable() });
  });

  router.post('/tenants', async (req, res) => {
    const body = req.body || {};
    const { name, origin, apiKey, apiSecret, approveCustomDomain } = body;
    if (Object.hasOwn(body, 'customHeaders')) {
      return res.status(400).json({ success: false, error: 'Custom headers are not accepted' });
    }
    if (!origin || !apiKey || !apiSecret) {
      return res.status(400).json({ success: false, error: 'Missing required fields: origin, apiKey, apiSecret' });
    }

    let submittedOrigin;
    try {
      submittedOrigin = new URL(origin);
    } catch {
      return res.status(400).json({ success: false, error: 'Tenant origin must be a valid HTTPS URL' });
    }
    const hostname = submittedOrigin.hostname.toLowerCase();
    const isDefaultDomain = (hostname.endsWith('.forgeblocks.com') && hostname.length > '.forgeblocks.com'.length) ||
      (hostname.endsWith('.id.forgerock.io') && hostname.length > '.id.forgerock.io'.length);
    if (!isDefaultDomain && !approveCustomDomain) {
      return res.status(400).json({ success: false, error: 'Custom tenant domain requires explicit local approval' });
    }

    try {
      const safeOrigin = await validateOrigin(origin, {
        approvedCustomDomains: isDefaultDomain ? [] : [origin]
      });
      const client = new LogClientClass({ origin: safeOrigin.origin, lookup: safeOrigin.lookup, apiKey, apiSecret });
      try {
        await client.testConnection();
      } finally {
        client.destroy();
      }

      const tenant = tenantRegistry.save({
        name: name || hostname,
        origin: safeOrigin.origin,
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
