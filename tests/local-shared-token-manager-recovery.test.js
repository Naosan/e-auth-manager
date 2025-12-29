import os from 'os';
import path from 'path';
import fs from 'fs/promises';

import LocalSharedTokenManager from '../src/LocalSharedTokenManager.js';

describe('LocalSharedTokenManager recovery behavior', () => {
  test('backs up and resets token file on master key mismatch', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const tokenFilePath = path.join(tempDir, 'ebay-tokens.encrypted.json');

    const writer = new LocalSharedTokenManager({ tokenFilePath, masterKey: 'key-1' });
    await writer.saveToken('test-app', {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 7200,
      refreshTokenExpiresIn: 47304000,
      accessTokenUpdatedDate: new Date().toISOString(),
      refreshTokenUpdatedDate: new Date().toISOString()
    });

    const reader = new LocalSharedTokenManager({
      tokenFilePath,
      masterKey: 'key-2',
      recoveryMode: 'backup-and-reset'
    });
    const data = await reader.readTokenFile();

    expect(Object.keys(data.tokens)).toHaveLength(0);

    const entries = await fs.readdir(tempDir);
    expect(entries.some(name => name.startsWith('ebay-tokens.encrypted.json.backup.'))).toBe(true);
  });
});
