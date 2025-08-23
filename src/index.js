// @your-org/ebay-oauth-token-manager - Main Entry Point
import LocalSharedTokenManager from './LocalSharedTokenManager.js';
import ApplicationAccessToken_ClientCredentialsManager from './ApplicationAccessToken_ClientCredentialsManager.js';
import UserAccessToken_AuthorizationCodeManager from './UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from './config.js';

// Load configuration
const config = loadConfig();

// Default instance for backward compatibility - always use UserAccessToken_AuthorizationCodeManager with automatic dual storage
let defaultTokenManager = new UserAccessToken_AuthorizationCodeManager(config);
console.log('🔄 Using UserAccessToken_AuthorizationCodeManager with automatic dual storage (Database + Encrypted JSON)');

// Export classes for direct access if needed
export {
  LocalSharedTokenManager,
  ApplicationAccessToken_ClientCredentialsManager,
  UserAccessToken_AuthorizationCodeManager
};

// Export OAuth scope utilities for convenience
export { EBAY_SCOPES, getScopeString, validateScopeSubset, getScopesForApiType } from './ebayScopes.js';

// ========================================
// CORE TOKEN FUNCTIONS (API-SPECIFIC METHODS)
// ========================================

/**
 * Browse API専用のApplication Access Token取得
 * 用途: 商品検索、商品詳細取得、公開データアクセス
 * OAuth2 Flow: Client Credentials Grant
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - Browse API用 Application Access Token
 */
export const getBrowseApiToken = (appId, options = {}) => {
  console.log('🔑 Getting Browse API Application Access Token');
  
  // Handle case where first parameter is options object (backward compatibility)
  if (typeof appId === 'object' && appId !== null) {
    options = appId;
    appId = undefined;
  }
  
  if (!appId) {
    // Use eBay official naming convention
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID ||
             'default';
  }
  const manager = new ApplicationAccessToken_ClientCredentialsManager({ ...config, ...options });
  return manager.getApplicationAccessToken();
};

/**
 * Taxonomy API専用のApplication Access Token取得
 * 用途: カテゴリ階層取得、商品属性情報、カテゴリツリー探索
 * OAuth2 Flow: Client Credentials Grant
 * API Endpoint: /commerce/taxonomy/v1/*
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - Taxonomy API用 Application Access Token
 */
export const getTaxonomyApiToken = (options = {}) => {
  console.log('🏷️ Getting Taxonomy API Application Access Token');
  
  const manager = new ApplicationAccessToken_ClientCredentialsManager({ 
    ...config, 
    ...options,
    scope: options.scope || 'https://api.ebay.com/oauth/api_scope'
  });
  return manager.getApplicationAccessToken();
};

/**
 * Trading API専用のUser Access Token取得
 * 用途: 出品、入札、ユーザー固有操作
 * OAuth2 Flow: Authorization Code Grant
 * @param {string} appId - eBay App ID
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - Trading API用 User Access Token
 */
export const getTradingApiToken = (appId, options = {}) => {
  console.log('🔑 Getting Trading API User Access Token');
  if (!appId) {
    // Use eBay official naming convention
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID; // App ID (Client ID) - eBay official name
  }
  
  if (!appId) {
    console.warn('⚠️ No App ID provided, using default configuration. Consider setting EBAY_CLIENT_ID environment variable.');
    // Use a default instead of throwing error
    appId = 'default';
  }

  // Always use database-based manager with automatic dual storage
  return defaultTokenManager.getUserAccessTokenByAppId(appId);
};

// ========================================
// LEGACY COMPATIBILITY FUNCTIONS (DEPRECATED)
// ========================================

/**
 * Get Application Access Token (client_credentials grant) for Browse API
 * @deprecated Use getBrowseApiToken() instead for clarity
 * @returns {Promise<string>} - Application Access Token  
 */
export const getApplicationAccessToken = () => {
  console.warn('⚠️ getApplicationAccessToken() is deprecated. Use getBrowseApiToken() instead.');
  return getBrowseApiToken();
};

/**
 * Get User Access Token by App ID (preferred method)
 * @param {string} appId - eBay App ID
 * @returns {Promise<string>} - User Access token
 */
export const getUserAccessTokenByAppId = (appId) => {
  if (!appId) {
    appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME;
  }
  
  if (!appId) {
    throw new Error('App ID is required. Set EBAY_DEFAULT_APP_ID or EBAY_API_APP_NAME environment variable.');
  }

  // Always use database-based manager with automatic dual storage
  return defaultTokenManager.getUserAccessTokenByAppId(appId);
};

/**
 * Get User Access Token by account name (legacy compatibility)
 * @param {string} [accountName] - Account name
 * @returns {Promise<string>} - User Access token
 */
export const getUserAccessToken = (accountName = 'default') => {
  // Always use database-based manager with automatic dual storage
  // Try Default App ID first if no specific account name provided
  if (accountName === 'default') {
    const appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME;
    if (appId) {
      return defaultTokenManager.getUserAccessTokenByAppId(appId).catch(() => {
        return defaultTokenManager.getUserAccessToken('default');
      });
    }
  }
  return defaultTokenManager.getUserAccessToken(accountName);
};

/**
 * Initialize token manager
 * @returns {Promise<void>}
 */
export const initialize = () => {
  if (defaultTokenManager.initialize) {
    return defaultTokenManager.initialize();
  }
  return Promise.resolve();
};

// ========================================
// LEGACY APPLICATION COMPATIBILITY
// ========================================

/**
 * Check if User Refresh Token is still valid (not expired)
 * Refresh Tokens are long-lived (typically 18 months) and allow renewal of User Access Tokens
 * @param {string} [appId] - eBay App ID to check (optional)
 * @returns {Promise<boolean>} True if User Refresh Token is valid, false if expired or not found
 */
export const checkRefreshTokenValidity = (appId) => {
  if (!appId) {
    // Use eBay official naming convention
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID ||
             'default';
  }
  
  // Always use database-based manager with automatic dual storage
  if (typeof defaultTokenManager.checkRefreshTokenValidity === 'function') {
    return defaultTokenManager.checkRefreshTokenValidity(appId);
  }
  if (defaultTokenManager.fileTokenManager?.checkRefreshTokenValidity) {
    // クラス側未実装でも、JSON層で全体チェックが可能
    return defaultTokenManager.fileTokenManager.checkRefreshTokenValidity(appId);
  }
  return Promise.resolve(false);
};

/**
 * Get a valid **User Access Token** for eBay API calls
 * - Returns a fresh User Access Token, automatically refreshing via Refresh Token if expired
 * - User Access Tokens are short-lived (≈2 hours) and required for all account-specific operations
 * @returns {Promise<string>} Valid User Access Token for API requests
 */
export const getValidAccessToken = () => {
  // Always use database-based manager with automatic dual storage
  const appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME;
  if (appId) {
    return defaultTokenManager.getUserAccessTokenByAppId(appId);
  }
  return defaultTokenManager.getUserAccessToken('default');
};

// ========================================
// NEW TOKEN INFORMATION METHODS
// ========================================

/**
 * Get comprehensive User Access Token information including metadata
 * @param {string} appId - The eBay App ID to get token info for
 * @returns {Promise<Object>} User token information object
 */
export const getUserTokenInfo = (appId) => {
  if (!appId) {
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID ||
             'default';
  }
  
  return defaultTokenManager.getUserTokenInfo(appId);
};

/**
 * Get User Access Token expiration information
 * @param {string} appId - The eBay App ID to check expiration for
 * @returns {Promise<Object>} User token expiration information object
 */
export const getUserTokenExpiration = (appId) => {
  if (!appId) {
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID ||
             'default';
  }
  
  return defaultTokenManager.getUserTokenExpiration(appId);
};

/**
 * Get the eBay account name associated with a User Access Token
 * @param {string} appId - The eBay App ID to get account name for
 * @returns {Promise<string>} The eBay account name
 */
export const getUserAccountName = (appId) => {
  if (!appId) {
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID ||
             'default';
  }
  
  return defaultTokenManager.getUserAccountName(appId);
};

// Backward compatibility aliases for User Access Token info methods
// DO NOT REMOVE (used by existing packages)
export const getTokenInfo = getUserTokenInfo;
export const getTokenExpiration = getUserTokenExpiration;
export const getAccountName = getUserAccountName;