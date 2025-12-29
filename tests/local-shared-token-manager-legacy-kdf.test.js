import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

import LocalSharedTokenManager from '../src/LocalSharedTokenManager.js';

describe('LocalSharedTokenManager legacy KDF compatibility', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('can decrypt legacy token file encrypted with masterKey+machineId KDF (v1.1.1)', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const tokenFilePath = path.join(tempDir, 'ebay-tokens.encrypted.json');
    const masterKey = 'legacy-master-key';
    const machineId = 'default-machine';
    process.env.COMPUTERNAME = machineId;

    const plaintext = {
      tokens: {
        'test-app': {
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresIn: 7200,
          refreshTokenExpiresIn: 47304000,
          accessTokenUpdatedDate: new Date().toISOString(),
          refreshTokenUpdatedDate: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        }
      }
    };

    const legacyKey = crypto.scryptSync(
      masterKey + machineId,
      'ebay-research-salt-v1',
      32
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', legacyKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(plaintext), 'utf8'),
      cipher.final()
    ]);

    const legacyFile = {
      version: '1.0',
      encrypted: true,
      algorithm: 'aes-256-cbc',
      data: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      lastUpdated: new Date().toISOString()
    };

    await fs.writeFile(tokenFilePath, JSON.stringify(legacyFile), 'utf8');

    const manager = new LocalSharedTokenManager({ tokenFilePath, masterKey });
    const data = await manager.readTokenFile();
    expect(data.tokens['test-app']).toBeDefined();

    await manager.saveToken('another-app', {
      accessToken: 'access2',
      refreshToken: 'refresh2',
      expiresIn: 7200,
      refreshTokenExpiresIn: 47304000,
      accessTokenUpdatedDate: new Date().toISOString(),
      refreshTokenUpdatedDate: new Date().toISOString()
    });

    const migratedHeader = JSON.parse(await fs.readFile(tokenFilePath, 'utf8'));
    expect(migratedHeader.kdfVersion).toBe(1);
  });
});

