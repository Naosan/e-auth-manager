describe('loadConfig env aliases and defaultAppId', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('loads from EAUTH_CONFIG file', async () => {
    process.env.EAUTH_CLIENT_ID = '';
    process.env.EAUTH_CLIENT_SECRET = '';
    process.env.EAUTH_EBAY_CLIENT_ID = '';
    process.env.EAUTH_EBAY_CLIENT_SECRET = '';

    const fs = await import('fs');
    const path = await import('path');
    const tmp = path.join(process.cwd(), `tmp-config-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
      defaultAppId: 'cfg-app'
    }));

    process.env.EAUTH_CONFIG = tmp;

    const { loadConfig } = await import(`../src/config.js?ts=${Date.now()}`);
    const config = loadConfig();

    expect(config.clientId).toBe('cfg-id');
    expect(config.clientSecret).toBe('cfg-secret');
    expect(config.defaultAppId).toBe('cfg-app');

    fs.unlinkSync(tmp);
  });

  test('prefers EAUTH_* over EBAY_*', async () => {
    process.env.EAUTH_EBAY_CLIENT_ID = '';
    process.env.EAUTH_EBAY_CLIENT_SECRET = '';
    process.env.EAUTH_CLIENT_ID = 'eauth-id';
    process.env.EAUTH_CLIENT_SECRET = 'eauth-secret';
    process.env.EAUTH_DEFAULT_APP_ID = 'eauth-default';
    process.env.EBAY_CLIENT_ID = 'ebay-id';
    process.env.EBAY_CLIENT_SECRET = 'ebay-secret';
    process.env.EBAY_DEFAULT_APP_ID = 'ebay-default';

    const { loadConfig } = await import(`../src/config.js?ts=${Date.now()}`);
    const config = loadConfig();

    expect(config.clientId).toBe('eauth-id');
    expect(config.clientSecret).toBe('eauth-secret');
    expect(config.defaultAppId).toBe('eauth-default');
  });

  test('loads accounts from EAUTH_CONFIG file', async () => {
    process.env.EAUTH_CLIENT_ID = '';
    process.env.EAUTH_CLIENT_SECRET = '';
    process.env.EAUTH_EBAY_CLIENT_ID = '';
    process.env.EAUTH_EBAY_CLIENT_SECRET = '';

    const fs = await import('fs');
    const path = await import('path');
    const tmp = path.join(process.cwd(), `tmp-config-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
      defaultAppId: 'cfg-app',
      accounts: [{ accountName: 'acc1', appId: 'app1' }]
    }));

    process.env.EAUTH_CONFIG = tmp;

    const { loadConfig } = await import(`../src/config.js?ts=${Date.now()}`);
    const config = loadConfig();

    expect(config.clientId).toBe('cfg-id');
    expect(config.clientSecret).toBe('cfg-secret');
    expect(config.defaultAppId).toBe('cfg-app');
    expect(config.accounts).toEqual([{ accountName: 'acc1', appId: 'app1' }]);

    fs.unlinkSync(tmp);
  });

  test('falls back to EBAY_API_* aliases and EBAY_DEFAULT_APP_ID when EBAY_CLIENT_ID/SECRET are absent', async () => {
    process.env.EAUTH_CLIENT_ID = '';
    process.env.EAUTH_CLIENT_SECRET = '';
    process.env.EAUTH_EBAY_CLIENT_ID = '';
    process.env.EAUTH_EBAY_CLIENT_SECRET = '';
    process.env.EBAY_CLIENT_ID = '';
    process.env.EBAY_CLIENT_SECRET = '';
    process.env.EBAY_DEFAULT_APP_ID = '';

    process.env.EBAY_API_APP_NAME = 'alias-app';
    process.env.EBAY_API_CERT_NAME = 'alias-secret';
    process.env.EBAY_DEFAULT_APP_ID = 'default-alias-app';

    const { loadConfig } = await import(`../src/config.js?ts=${Date.now()}`);
    const config = loadConfig();

    expect(config.clientId).toBe('alias-app');
    expect(config.clientSecret).toBe('alias-secret');
    expect(config.defaultAppId).toBe('default-alias-app');
  });
});
