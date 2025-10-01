import { jest } from '@jest/globals';

const mockManager = {
  getUserAccessTokenByAppId: jest.fn(),
  getTokenByAppId: jest.fn(),
  renewUserAccessTokenByAppId: jest.fn()
};

jest.unstable_mockModule('../src/config.js', () => ({
  loadConfig: jest.fn().mockReturnValue({
    clientId: 'mock-client',
    clientSecret: 'mock-secret',
    defaultAppId: 'default-app'
  })
}));

jest.unstable_mockModule('../src/UserAccessToken_AuthorizationCodeManager.js', () => ({
  default: jest.fn().mockImplementation(() => mockManager)
}));

const {
  getMarketingApiToken,
  EBAY_SCOPES,
  getScopeString
} = await import('../src/index.js');

describe('getMarketingApiToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManager.getUserAccessTokenByAppId.mockResolvedValue('existing-token');
    mockManager.getTokenByAppId.mockResolvedValue({
      account_name: 'seller-account',
      refresh_token: 'encrypted-refresh-token',
      refresh_token_updated_date: '2024-08-01T00:00:00.000Z',
      refresh_token_expires_in: 47304000,
      expires_in: 7200
    });
    mockManager.renewUserAccessTokenByAppId.mockResolvedValue({
      access_token: 'refreshed-token',
      expires_in: 7200
    });
  });

  test('returns existing token when forceRefresh is false', async () => {
    const token = await getMarketingApiToken('custom-app');

    expect(mockManager.getUserAccessTokenByAppId).toHaveBeenCalledWith('custom-app');
    expect(mockManager.renewUserAccessTokenByAppId).not.toHaveBeenCalled();
    expect(token).toBe('existing-token');
  });

  test('falls back to default app id when none provided', async () => {
    await getMarketingApiToken();

    expect(mockManager.getUserAccessTokenByAppId).toHaveBeenCalledWith('default-app');
  });

  test('forces refresh with marketing scopes when requested', async () => {
    const expectedScope = getScopeString(EBAY_SCOPES.MARKETING_FULL);

    const token = await getMarketingApiToken('custom-app', { forceRefresh: true });

    expect(mockManager.getTokenByAppId).toHaveBeenCalledWith('custom-app');
    expect(mockManager.renewUserAccessTokenByAppId).toHaveBeenCalledWith(
      'custom-app',
      expect.objectContaining({ account_name: 'seller-account' }),
      { scope: expectedScope }
    );
    expect(token).toBe('refreshed-token');
  });

  test('uses read-only marketing scope when requested', async () => {
    const expectedScope = getScopeString(EBAY_SCOPES.MARKETING_READONLY);

    await getMarketingApiToken('custom-app', { forceRefresh: true, readOnly: true });

    expect(mockManager.renewUserAccessTokenByAppId).toHaveBeenCalledWith(
      'custom-app',
      expect.any(Object),
      { scope: expectedScope }
    );
  });

  test('accepts custom scope override', async () => {
    await getMarketingApiToken('custom-app', {
      forceRefresh: true,
      scope: 'custom scope'
    });

    expect(mockManager.renewUserAccessTokenByAppId).toHaveBeenCalledWith(
      'custom-app',
      expect.any(Object),
      { scope: 'custom scope' }
    );
  });

  test('throws when forceRefresh is true but no token data exists', async () => {
    mockManager.getTokenByAppId.mockResolvedValueOnce(null);

    await expect(
      getMarketingApiToken('custom-app', { forceRefresh: true })
    ).rejects.toThrow('No token found for App ID: custom-app');
  });

  test('accepts custom scope override as array', async () => {
    await getMarketingApiToken('custom-app', {
      forceRefresh: true,
      scope: ['a', 'b']
    });

    expect(mockManager.renewUserAccessTokenByAppId).toHaveBeenCalledWith(
      'custom-app',
      expect.any(Object),
      { scope: 'a b' }
    );
  });

  test('options can be first argument (backward-compat)', async () => {
    const token = await getMarketingApiToken({ forceRefresh: true, readOnly: true });

    // Defaults to config.defaultAppId when appId omitted
    expect(mockManager.getTokenByAppId).toHaveBeenCalledWith('default-app');
    expect(mockManager.renewUserAccessTokenByAppId).toHaveBeenCalledWith(
      'default-app',
      expect.any(Object),
      { scope: expect.stringMatching(/sell\.marketing\.readonly/) }
    );
    expect(token).toBe('refreshed-token');
  });

  test('falls back if manager does not support force refresh', async () => {
    // Remove methods to simulate older manager
    const origGet = mockManager.getTokenByAppId;
    const origRenew = mockManager.renewUserAccessTokenByAppId;
    delete mockManager.getTokenByAppId;
    delete mockManager.renewUserAccessTokenByAppId;

    const token = await getMarketingApiToken('custom-app', { forceRefresh: true });

    expect(mockManager.getUserAccessTokenByAppId).toHaveBeenCalledWith('custom-app');
    expect(token).toBe('existing-token');

    // restore
    mockManager.getTokenByAppId = origGet;
    mockManager.renewUserAccessTokenByAppId = origRenew;
  });

  test('fallback to stored token when refresh returns no access_token', async () => {
    mockManager.renewUserAccessTokenByAppId.mockResolvedValueOnce({});

    const token = await getMarketingApiToken('custom-app', { forceRefresh: true });

    // Should fallback to getUserAccessTokenByAppId
    expect(mockManager.getUserAccessTokenByAppId).toHaveBeenCalledWith('custom-app');
    expect(token).toBe('existing-token');
  });
});
