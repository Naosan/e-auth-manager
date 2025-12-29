import os from 'os';
import path from 'path';
import fs from 'fs/promises';

import LocalSharedTokenManager from '../src/LocalSharedTokenManager.js';

describe('LocalSharedTokenManager integrity (MAC)', () => {
  test('rejects tampered token file by default (recoveryMode=error)', async () => {
    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const tokenFilePath = path.join(tempDir, 'ebay-tokens.encrypted.json');
    const masterKey = 'mac-master-key';

    const writer = new LocalSharedTokenManager({ tokenFilePath, masterKey });
    await writer.saveToken('test-app', {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 7200,
      refreshTokenExpiresIn: 47304000,
      accessTokenUpdatedDate: new Date().toISOString(),
      refreshTokenUpdatedDate: new Date().toISOString()
    });

    const original = JSON.parse(await fs.readFile(tokenFilePath, 'utf8'));
    original.data = original.data.slice(0, -1) + (original.data.endsWith('A') ? 'B' : 'A');
    await fs.writeFile(tokenFilePath, JSON.stringify(original), 'utf8');

    const reader = new LocalSharedTokenManager({ tokenFilePath, masterKey });
    await expect(reader.readTokenFile()).rejects.toMatchObject({ code: 'EAUTH_TOKEN_FILE_UNREADABLE' });

    const entries = await fs.readdir(tempDir);
    expect(entries.some(name => name.startsWith('ebay-tokens.encrypted.json.backup.'))).toBe(false);
  });
});

