import os from 'os';
import path from 'path';

describe('defaultAccountName + env masterKey behavior', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('loadConfig reads defaultAccountName from EAUTH_ACCOUNT_NAME / EBAY_ACCOUNT_NAME', async () => {
    process.env.EAUTH_ACCOUNT_NAME = 'example-account';
    process.env.EBAY_ACCOUNT_NAME = 'ignored';

    const { loadConfig } = await import(`../src/config.js?ts=${Date.now()}`);
    const config = loadConfig();
    expect(config.defaultAccountName).toBe('example-account');

    process.env.EAUTH_ACCOUNT_NAME = '';
    process.env.EBAY_ACCOUNT_NAME = 'example-account-2';
    const { loadConfig: loadConfig2 } = await import(`../src/config.js?ts=${Date.now()}`);
    const config2 = loadConfig2();
    expect(config2.defaultAccountName).toBe('example-account-2');
  });

  test('UserAccessToken_AuthorizationCodeManager uses env master key when options.masterKey is missing', async () => {
    process.env.EAUTH_MASTER_KEY = 'env-master-key';

    const { default: UserAccessToken_AuthorizationCodeManager } = await import(
      `../src/UserAccessToken_AuthorizationCodeManager.js?ts=${Date.now()}`
    );

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: true,
    });

    expect(manager.masterKey).toBe('env-master-key');
    expect(manager.customMasterKeyProvided).toBe(true);
  });

  test('LocalSharedTokenManager uses env master key when options.masterKey is missing', async () => {
    process.env.EAUTH_MASTER_KEY = 'env-master-key';

    const { default: LocalSharedTokenManager } = await import(
      `../src/LocalSharedTokenManager.js?ts=${Date.now()}`
    );

    const tokenFilePath = path.join(os.tmpdir(), `eauth-test-${Date.now()}.json`);
    const manager = new LocalSharedTokenManager({ tokenFilePath });
    expect(manager.masterKey).toBe('env-master-key');
  });

  test('setRefreshToken defaults to EBAY_ACCOUNT_NAME when accountName is omitted', async () => {
    process.env.EAUTH_ACCOUNT_NAME = '';
    process.env.EBAY_ACCOUNT_NAME = 'example-account';

    const { default: UserAccessToken_AuthorizationCodeManager } = await import(
      `../src/UserAccessToken_AuthorizationCodeManager.js?ts=${Date.now()}`
    );

    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');
    const tokenFilePath = path.join(tempDir, 'tokens.encrypted.json');

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      databasePath,
      tokenFilePath,
      encryptionEnabled: true,
    });

    await manager.setRefreshToken('v^test-refresh-token');

    const db = await manager.getDb();
    const row = await db.get('SELECT account_name AS accountName FROM ebay_oauth_tokens LIMIT 1');
    expect(row.accountName).toBe('example-account');

    await db.close();
  });
});
