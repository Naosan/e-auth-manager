import { jest } from '@jest/globals';

// Global mocks used by index.js
jest.unstable_mockModule('../src/config.js', () => ({
  loadConfig: jest.fn().mockReturnValue({
    clientId: 'mock-client',
    clientSecret: 'mock-secret',
    defaultAppId: 'default-app'
  })
}));

// One shared manager instance; we tweak its mocked return values per test
const manager = {
  checkRefreshTokenValidity: jest.fn(),
  fileTokenManager: {
    checkRefreshTokenValidity: jest.fn()
  }
};

jest.unstable_mockModule('../src/UserAccessToken_AuthorizationCodeManager.js', () => ({
  default: jest.fn().mockImplementation(() => manager)
}));

const { checkRefreshTokenValidity, getRefreshTokenHealth } = await import('../src/index.js');

describe('refresh token validity helpers', () => {
  beforeEach(() => {
    manager.checkRefreshTokenValidity.mockReset();
    manager.fileTokenManager.checkRefreshTokenValidity.mockReset();
  });

  describe('checkRefreshTokenValidity', () => {
    test('returns true when DB check is true (no file fallback)', async () => {
      manager.checkRefreshTokenValidity.mockResolvedValueOnce(true);

      const result = await checkRefreshTokenValidity('custom-app');

      expect(manager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(result).toBe(true);
      expect(manager.fileTokenManager.checkRefreshTokenValidity).not.toHaveBeenCalled();
    });

    test('falls back to file when DB returns false', async () => {
      manager.checkRefreshTokenValidity.mockResolvedValueOnce(false);
      manager.fileTokenManager.checkRefreshTokenValidity.mockResolvedValueOnce(true);

      const result = await checkRefreshTokenValidity('custom-app');

      expect(manager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(manager.fileTokenManager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(result).toBe(true);
    });

    test('falls back to file when DB throws', async () => {
      manager.checkRefreshTokenValidity.mockRejectedValueOnce(new Error('db error'));
      manager.fileTokenManager.checkRefreshTokenValidity.mockResolvedValueOnce(true);

      const result = await checkRefreshTokenValidity('custom-app');

      expect(manager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(manager.fileTokenManager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(result).toBe(true);
    });

    test('returns false when both DB and file checks are false', async () => {
      manager.checkRefreshTokenValidity.mockResolvedValueOnce(false);
      manager.fileTokenManager.checkRefreshTokenValidity.mockResolvedValueOnce(false);

      const result = await checkRefreshTokenValidity('custom-app');

      expect(manager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(manager.fileTokenManager.checkRefreshTokenValidity).toHaveBeenCalledWith('custom-app');
      expect(result).toBe(false);
    });
  });

  describe('getRefreshTokenHealth', () => {
    test('reports database as source when valid in DB', async () => {
      manager.checkRefreshTokenValidity.mockResolvedValueOnce(true);

      const health = await getRefreshTokenHealth('custom-app');

      expect(health.isValid).toBe(true);
      expect(health.source).toBe('database');
      expect(health.layers.database.status).toBe('valid');
      expect(health.layers.encryptedJson.status).toBe('not_attempted');
    });

    test('reports encrypted JSON as source when fallback succeeds', async () => {
      manager.checkRefreshTokenValidity.mockResolvedValueOnce(false);
      manager.fileTokenManager.checkRefreshTokenValidity.mockResolvedValueOnce(true);

      const health = await getRefreshTokenHealth('custom-app');

      expect(health.isValid).toBe(true);
      expect(health.source).toBe('encrypted-json');
      expect(health.layers.database.status).toBe('invalid');
      expect(health.layers.encryptedJson.status).toBe('valid');
    });

    test('reports error details when both layers fail', async () => {
      manager.checkRefreshTokenValidity.mockRejectedValueOnce(new Error('db unavailable'));
      manager.fileTokenManager.checkRefreshTokenValidity.mockRejectedValueOnce(new Error('file unreadable'));

      const health = await getRefreshTokenHealth('custom-app');

      expect(health.isValid).toBe(false);
      expect(health.source).toBeNull();
      expect(health.layers.database.status).toBe('error');
      expect(health.layers.database.error).toBe('db unavailable');
      expect(health.layers.encryptedJson.status).toBe('error');
      expect(health.layers.encryptedJson.error).toBe('file unreadable');
    });
  });
});
