const LogClient = require('../api/logClient');
const { validateAicOrigin } = require('../security/originPolicy');

async function createTenantClient({
  tenantId,
  tenantRegistry,
  credentialStore,
  validateOrigin = validateAicOrigin,
  LogClientClass = LogClient
}) {
  const tenant = tenantRegistry.get(tenantId);
  if (!tenant) throw new Error('Unknown tenant');

  const credentials = credentialStore.get(tenantId);
  if (!credentials) throw new Error('No saved credentials for tenant');

  const approvedCustomDomains = tenant.approvedCustomDomain ? [tenant.origin] : [];
  const safeOrigin = await validateOrigin(tenant.origin, { approvedCustomDomains });

  return new LogClientClass({
    origin: safeOrigin.origin,
    lookup: safeOrigin.lookup,
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret
  });
}

module.exports = { createTenantClient };
