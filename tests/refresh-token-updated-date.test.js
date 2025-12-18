import { jest } from '@jest/globals';
import axios from 'axios';
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';

describe('refresh_token_updated_date handling', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('does not bump refreshTokenUpdatedDate when provider echoes the same refresh token (legacy account flow)', async () => {
    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      encryptionEnabled: false,
    });

    const tokenData = {
      refresh_token: 'rt-1',
      refresh_token_updated_date: '2024-01-01T00:00:00.000Z',
      refresh_token_expires_in: 47304000,
    };

    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-1', expires_in: 7200, token_type: 'Bearer', refresh_token: 'rt-1' },
    });
    jest.spyOn(manager, 'saveUserAccessToken').mockResolvedValue();

    await manager.renewUserAccessToken('test-account', tokenData);

    const saved = manager.saveUserAccessToken.mock.calls[0][1];
    expect(saved.refreshTokenUpdatedDate).toBe(tokenData.refresh_token_updated_date);
  });

  test('bumps refreshTokenUpdatedDate only when refresh token actually changes (legacy account flow)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-01T00:00:00Z'));

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      encryptionEnabled: false,
    });

    const tokenData = {
      refresh_token: 'rt-old',
      refresh_token_updated_date: '2024-01-01T00:00:00.000Z',
      refresh_token_expires_in: 47304000,
    };

    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-2', expires_in: 7200, token_type: 'Bearer', refresh_token: 'rt-new' },
    });
    jest.spyOn(manager, 'saveUserAccessToken').mockResolvedValue();

    await manager.renewUserAccessToken('test-account', tokenData);

    const saved = manager.saveUserAccessToken.mock.calls[0][1];
    expect(saved.refreshTokenUpdatedDate).toBe('2024-03-01T00:00:00.000Z');
  });

  test('does not touch SSOT provider when refresh token does not rotate (App ID flow)', async () => {
    const tokenProvider = {
      get: jest.fn().mockResolvedValue({
        refreshToken: 'rt-provider',
        version: 3,
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
      set: jest.fn().mockResolvedValue({
        refreshToken: 'rt-provider',
        version: 3,
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
      withLock: jest.fn(async (_appId, fn) => fn()),
    };

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      encryptionEnabled: false,
      tokenProvider,
    });

    const tokenData = {
      account_name: 'test-account',
      refresh_token: 'rt-db',
      refresh_token_updated_date: '2024-01-01T00:00:00.000Z',
      refresh_token_expires_in: 47304000,
    };

    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-3', expires_in: 7200, token_type: 'Bearer', refresh_token: 'rt-provider' },
    });
    jest.spyOn(manager, 'saveUserAccessToken').mockResolvedValue();

    await manager.renewUserAccessTokenByAppId('test-app-id', tokenData);

    expect(tokenProvider.set).not.toHaveBeenCalled();

    const saved = manager.saveUserAccessToken.mock.calls[0][1];
    expect(saved.refreshTokenUpdatedDate).toBe(tokenData.refresh_token_updated_date);
  });

  test('updates SSOT provider + refreshTokenUpdatedDate when refresh token rotates (App ID flow)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-02T00:00:00Z'));

    const tokenProvider = {
      get: jest.fn().mockResolvedValue({
        refreshToken: 'rt-old',
        version: 7,
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
      set: jest.fn().mockResolvedValue({
        refreshToken: 'rt-new',
        version: 8,
        updatedAt: '2024-03-02T00:00:00.000Z',
      }),
      withLock: jest.fn(async (_appId, fn) => fn()),
    };

    const manager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      encryptionEnabled: false,
      tokenProvider,
    });

    const tokenData = {
      account_name: 'test-account',
      refresh_token: 'rt-db',
      refresh_token_updated_date: '2024-01-01T00:00:00.000Z',
      refresh_token_expires_in: 47304000,
    };

    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-4', expires_in: 7200, token_type: 'Bearer', refresh_token: 'rt-new' },
    });
    jest.spyOn(manager, 'saveUserAccessToken').mockResolvedValue();

    await manager.renewUserAccessTokenByAppId('test-app-id', tokenData);

    expect(tokenProvider.set).toHaveBeenCalledWith('test-app-id', 'rt-new', 8);

    const saved = manager.saveUserAccessToken.mock.calls[0][1];
    expect(saved.refreshTokenUpdatedDate).toBe('2024-03-02T00:00:00.000Z');
  });
});
