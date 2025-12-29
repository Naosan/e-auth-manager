import os from 'os';
import path from 'path';
import { jest } from '@jest/globals';

import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';

describe('UserAccessToken_AuthorizationCodeManager readiness', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('public methods await auto-seeding barrier', async () => {
    let releaseSeed;
    const seedBarrier = new Promise(resolve => {
      releaseSeed = resolve;
    });

    jest
      .spyOn(UserAccessToken_AuthorizationCodeManager.prototype, 'setRefreshToken')
      .mockImplementation(async () => {
        await seedBarrier;
      });

    const tempDir = path.join(os.tmpdir(), `eauth-test-${Date.now()}`);
    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'dummy-client-id',
      clientSecret: 'dummy-client-secret',
      encryptionEnabled: false,
      databasePath: path.join(tempDir, 'tokens.sqlite'),
      initialRefreshToken: 'v^test-refresh-token'
    });

    const validityPromise = manager.checkRefreshTokenValidity();

    const state = await Promise.race([
      validityPromise.then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('pending'), 150))
    ]);

    expect(state).toBe('pending');

    releaseSeed();
    await validityPromise;
  });
});
