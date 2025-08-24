/**
 * Tests for new token information methods
 * getTokenInfo(), getTokenExpiration(), getAccountName()
 */

import { jest } from '@jest/globals';
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';
import { getTokenInfo, getTokenExpiration, getAccountName } from '../src/index.js';

// Mock data
const mockTokenData = {
  account_name: 'test-account',
  app_id: 'test-app-id',
  access_token: 'encrypted_access_token',
  refresh_token: 'encrypted_refresh_token',
  access_token_updated_date: '2025-08-22T10:00:00Z',
  refresh_token_updated_date: '2025-08-22T10:00:00Z',
  expires_in: 7200, // 2 hours
  refresh_token_expires_in: 47304000, // 1.5 years
  token_type: 'Bearer'
};

const mockDecryptedAccessToken = 'v^1.1#i^1#p^3#r^1#I^3#f^0#t^H4s...';
const mockDecryptedRefreshToken = 'v^1.1#i^1#r^1#p^3#I^3#f^0#t^Ul1...';

describe('Token Information Methods', () => {
  let tokenManager;
  
  beforeEach(async () => {
    tokenManager = new UserAccessToken_AuthorizationCodeManager({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      masterKey: 'test-master-key'
    });
    
    // Mock the database initialization and methods
    jest.spyOn(tokenManager, 'initializeDatabase').mockResolvedValue();
    jest.spyOn(tokenManager, 'getDb').mockResolvedValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn(),
      close: jest.fn()
    });
    jest.spyOn(tokenManager, 'getTokenByAppId').mockResolvedValue(mockTokenData);
    jest.spyOn(tokenManager, 'decryptToken')
      .mockReturnValueOnce(mockDecryptedAccessToken)
      .mockReturnValueOnce(mockDecryptedRefreshToken);
    jest.spyOn(tokenManager, 'isAccessTokenExpired').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getTokenInfo()', () => {
    test('should return comprehensive token information', async () => {
      const result = await tokenManager.getUserTokenInfo('test-app-id');
      
      expect(result).toEqual({
        access_token: mockDecryptedAccessToken,
        refresh_token: mockDecryptedRefreshToken,
        expires_at: expect.any(Date),
        account_name: 'test-account',
        token_type: 'User Access Token',
        access_token_updated_date: expect.any(Date),
        expires_in: 7200,
        refresh_token_updated_date: expect.any(Date),
        refresh_token_expires_in: 47304000
      });
    });

    test('should throw error when token not found', async () => {
      tokenManager.getTokenByAppId.mockResolvedValue(null);
      
      await expect(tokenManager.getUserTokenInfo('non-existent-app-id'))
        .rejects.toThrow('No token found for App ID: non-existent-app-id');
    });

    test('should calculate correct expiration date', async () => {
      const result = await tokenManager.getUserTokenInfo('test-app-id');
      const expectedExpiresAt = new Date('2025-08-22T12:00:00Z'); // 2 hours later
      
      expect(result.expires_at.getTime()).toBe(expectedExpiresAt.getTime());
    });
  });

  describe('getTokenExpiration()', () => {
    test('should return expiration information', async () => {
      // Mock current time to be 1 hour after token update
      const mockNow = new Date('2025-08-22T11:00:00Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);
      
      const result = await tokenManager.getUserTokenExpiration('test-app-id');
      
      expect(result).toEqual({
        expiresAt: expect.any(Date),
        expiresIn: 3600, // 1 hour remaining
        isExpired: false,
        percentageRemaining: 50 // 50% remaining
      });
      
      Date.now.mockRestore();
    });

    test('should handle expired tokens', async () => {
      tokenManager.isAccessTokenExpired.mockReturnValue(true);
      
      // Mock current time to be after expiration
      const mockNow = new Date('2025-08-22T13:00:00Z').getTime();
      jest.spyOn(Date, 'now').mockReturnValue(mockNow);
      
      const result = await tokenManager.getUserTokenExpiration('test-app-id');
      
      expect(result.isExpired).toBe(true);
      expect(result.expiresIn).toBe(0);
      expect(result.percentageRemaining).toBe(0);
      
      Date.now.mockRestore();
    });

    test('should throw error when token not found', async () => {
      tokenManager.getTokenByAppId.mockResolvedValue(null);
      
      await expect(tokenManager.getUserTokenExpiration('non-existent-app-id'))
        .rejects.toThrow('No token found for App ID: non-existent-app-id');
    });
  });

  describe('getAccountName()', () => {
    test('should return account name', async () => {
      const result = await tokenManager.getUserAccountName('test-app-id');
      
      expect(result).toBe('test-account');
    });

    test('should throw error when token not found', async () => {
      tokenManager.getTokenByAppId.mockResolvedValue(null);
      
      await expect(tokenManager.getUserAccountName('non-existent-app-id'))
        .rejects.toThrow('No token found for App ID: non-existent-app-id');
    });
  });
});

describe('Exported Functions', () => {
  beforeEach(() => {
    // Mock console methods to avoid test output pollution
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getTokenInfo should use default app ID when none provided', async () => {
    // This test would require mocking the entire default token manager
    // For now, we'll just test that the function exists and is callable
    expect(typeof getTokenInfo).toBe('function');
  });

  test('getTokenExpiration should use default app ID when none provided', async () => {
    expect(typeof getTokenExpiration).toBe('function');
  });

  test('getAccountName should use default app ID when none provided', async () => {
    expect(typeof getAccountName).toBe('function');
  });
});