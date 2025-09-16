import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';

describe('saveUserAccessToken upsert behaviour', () => {
  let tempDir;
  let manager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebay-oauth-upsert-'));
    manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      masterKey: 'test-master-key',
      databasePath: path.join(tempDir, 'tokens.sqlite'),
      tokenFilePath: path.join(tempDir, 'tokens.encrypted.json')
    });
  });

  afterEach(async () => {
    if (manager?.db?.close) {
      await manager.db.close();
      manager.db = null;
    }
    manager = null;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('performs an upsert when the same account is saved twice', async () => {
    const initialPayload = {
      accessToken: 'token-one',
      refreshToken: 'refresh-one',
      accessTokenUpdatedDate: '2024-01-01T00:00:00.000Z',
      refreshTokenUpdatedDate: '2024-01-01T00:00:00.000Z',
      expiresIn: 3600,
      refreshTokenExpiresIn: 47304000,
      tokenType: 'Bearer',
      appId: 'app-one'
    };

    const updatedPayload = {
      ...initialPayload,
      accessToken: 'token-two',
      refreshToken: 'refresh-two',
      accessTokenUpdatedDate: '2024-02-01T00:00:00.000Z',
      refreshTokenUpdatedDate: '2024-02-01T00:00:00.000Z',
      appId: 'app-two'
    };

    await manager.saveUserAccessToken('conflict-account', initialPayload);
    await manager.saveUserAccessToken('conflict-account', updatedPayload);

    const db = await manager.getDb();
    const rows = await db.all(`
      SELECT account_name, app_id, access_token, refresh_token,
             access_token_updated_date, refresh_token_updated_date
      FROM ebay_oauth_tokens
      WHERE account_name = ?
    `, ['conflict-account']);

    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.app_id).toBe('app-two');
    expect(manager.decryptToken(row.refresh_token)).toBe(updatedPayload.refreshToken);
    expect(manager.decryptToken(row.access_token)).toBe(updatedPayload.accessToken);
    expect(row.refresh_token_updated_date).toBe(updatedPayload.refreshTokenUpdatedDate);
    expect(row.access_token_updated_date).toBe(updatedPayload.accessTokenUpdatedDate);
  });
});
