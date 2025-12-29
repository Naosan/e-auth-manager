import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';

describe('encryption fingerprint mismatch safety', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('does not purge tokens by default on key change', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');
    const tokenFilePath = path.join(tempDir, 'tokens.encrypted.json');

    const writer = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: true,
      masterKey: 'key-1',
      databasePath,
      tokenFilePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await writer.setRefreshToken('v^stored-token');
    const writerDb = await writer.getDb();
    await writerDb.close();

    const reader = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: true,
      masterKey: 'key-2',
      databasePath,
      tokenFilePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await expect(reader.getDb()).rejects.toMatchObject({ code: 'EAUTH_ENCRYPTION_KEY_MISMATCH' });

    const db = await open({ filename: databasePath, driver: sqlite3.Database });
    const row = await db.get('SELECT COUNT(*) AS cnt FROM ebay_oauth_tokens');
    expect(row.cnt).toBe(1);
    await db.close();
  });

  test('purges tokens when EAUTH_PURGE_ON_KEY_CHANGE=1', async () => {
    process.env.EAUTH_PURGE_ON_KEY_CHANGE = '1';

    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const databasePath = path.join(tempDir, 'tokens.sqlite');
    const tokenFilePath = path.join(tempDir, 'tokens.encrypted.json');

    const writer = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: true,
      masterKey: 'key-1',
      databasePath,
      tokenFilePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    await writer.setRefreshToken('v^stored-token');
    const writerDb = await writer.getDb();
    await writerDb.close();

    const reader = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: true,
      masterKey: 'key-2',
      databasePath,
      tokenFilePath,
      defaultAccountName: 'default',
      defaultAppId: 'dummy-client-id'
    });

    const readerDb = await reader.getDb();
    await readerDb.close();

    const db = await open({ filename: databasePath, driver: sqlite3.Database });
    const row = await db.get('SELECT COUNT(*) AS cnt FROM ebay_oauth_tokens');
    expect(row.cnt).toBe(0);
    await db.close();
  });
});

