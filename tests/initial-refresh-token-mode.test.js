import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';

describe('initialRefreshTokenMode behavior', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('auto mode does not re-seed when stored refresh token matches', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');

    const seedManager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await seedManager.setRefreshToken('v^seed-token');

    const seedDb = await seedManager.getDb();
    await seedDb.close();

    const setRefreshTokenSpy = jest.spyOn(UserAccessToken_AuthorizationCodeManager.prototype, 'setRefreshToken');

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id',
      initialRefreshToken: 'v^seed-token',
      initialRefreshTokenMode: 'auto'
    });

    await manager.ready;

    expect(setRefreshTokenSpy).not.toHaveBeenCalled();

    const db = await manager.getDb();
    await db.close();
  });

  test('auto mode does not overwrite when stored refresh token differs (non-expired)', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');

    const seedManager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await seedManager.setRefreshToken('v^db-newer-token');
    const seedDb = await seedManager.getDb();
    await seedDb.close();

    const setRefreshTokenSpy = jest.spyOn(UserAccessToken_AuthorizationCodeManager.prototype, 'setRefreshToken');

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id',
      initialRefreshToken: 'v^env-older-token',
      initialRefreshTokenMode: 'auto'
    });

    await manager.ready;

    expect(setRefreshTokenSpy).not.toHaveBeenCalled();

    const db = await manager.getDb();
    const row = await db.get('SELECT refresh_token AS refreshToken FROM ebay_oauth_tokens LIMIT 1');
    expect(row.refreshToken).toBe('v^db-newer-token');
    await db.close();
  });

  test('auto mode re-seeds when stored refresh token is expired', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');

    const seedManager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await seedManager.setRefreshToken('v^expired-token');
    const seedDb = await seedManager.getDb();
    await seedDb.run(
      `UPDATE ebay_oauth_tokens
       SET refresh_token_updated_date = ?, refresh_token_expires_in = ?
       WHERE account_name = ?`,
      ['1970-01-01T00:00:00.000Z', 1, 'default']
    );
    await seedDb.close();

    const setRefreshTokenSpy = jest.spyOn(UserAccessToken_AuthorizationCodeManager.prototype, 'setRefreshToken');

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id',
      initialRefreshToken: 'v^env-replacement-token',
      initialRefreshTokenMode: 'auto'
    });

    await manager.ready;
    expect(setRefreshTokenSpy).toHaveBeenCalled();

    const db = await manager.getDb();
    const row = await db.get('SELECT refresh_token AS refreshToken FROM ebay_oauth_tokens LIMIT 1');
    expect(row.refreshToken).toBe('v^env-replacement-token');
    await db.close();
  });

  test('sync mode overwrites when stored refresh token differs', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');

    const seedManager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await seedManager.setRefreshToken('v^db-token');
    const seedDb = await seedManager.getDb();
    await seedDb.close();

    const setRefreshTokenSpy = jest.spyOn(UserAccessToken_AuthorizationCodeManager.prototype, 'setRefreshToken');

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id',
      initialRefreshToken: 'v^env-token',
      initialRefreshTokenMode: 'sync'
    });

    await manager.ready;

    expect(setRefreshTokenSpy).toHaveBeenCalled();

    const db = await manager.getDb();
    const row = await db.get('SELECT refresh_token AS refreshToken FROM ebay_oauth_tokens LIMIT 1');
    expect(row.refreshToken).toBe('v^env-token');
    await db.close();
  });
});
