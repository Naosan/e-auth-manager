// @your-org/ebay-oauth-token-manager - Main Entry Point
import LocalSharedTokenManager from './LocalSharedTokenManager.js';
import ApplicationAccessToken_ClientCredentialsManager from './ApplicationAccessToken_ClientCredentialsManager.js';
import UserAccessToken_AuthorizationCodeManager from './UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from './config.js';

// Load configuration
const config = loadConfig();

// Token management strategy selection
const useDatabase = config.useDatabase || process.env.EBAY_USE_DATABASE_TOKENS === 'true';
const useLegacyFile = config.useLegacyFile || process.env.EBAY_USE_LEGACY_TOKENS === 'true';

// Default instance for backward compatibility
let defaultTokenManager;
if (useDatabase) {
  defaultTokenManager = new UserAccessToken_AuthorizationCodeManager(config);
  console.log('🗄️ Using UserAccessToken_AuthorizationCodeManager for eBay tokens');
} else if (useLegacyFile) {
  defaultTokenManager = new LocalSharedTokenManager(config);
  console.log('📁 Using LocalSharedTokenManager for eBay tokens');
} else {
  defaultTokenManager = new ApplicationAccessToken_ClientCredentialsManager(config);
  console.log('🔑 Using ApplicationAccessToken_ClientCredentialsManager for eBay tokens');
}

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

  if (useDatabase) {
    return defaultTokenManager.getUserAccessTokenByAppId(appId);
  } else if (useLegacyFile) {
    return defaultTokenManager.getToken(appId);
  } else {
    throw new Error('Trading API requires User Access Token with database or file storage');
  }
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

  if (useDatabase) {
    return defaultTokenManager.getUserAccessTokenByAppId(appId);
  } else if (useLegacyFile) {
    return defaultTokenManager.getToken(appId);
  } else {
    throw new Error('getUserAccessTokenByAppId requires database or file mode');
  }
};

/**
 * Get User Access Token by account name (legacy compatibility)
 * @param {string} [accountName] - Account name
 * @returns {Promise<string>} - User Access token
 */
export const getUserAccessToken = (accountName = 'default') => {
  if (useDatabase) {
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
  } else if (useLegacyFile) {
    return defaultTokenManager.getToken('default');
  } else {
    throw new Error('getUserAccessToken requires database or file mode');
  }
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
 * Check refresh token validity (used by GetMySellerList and EStocksStockAndPriceDBManager)  
 * @returns {Promise<boolean>}
 */
export const checkRefreshTokenValidity = (appId) => {
  if (!appId) {
    // Use eBay official naming convention
    appId = config.defaultAppId || 
             process.env.EBAY_CLIENT_ID ||
             'default';
  }
  
  if (useDatabase) {
    return defaultTokenManager.checkRefreshTokenValidity();
  } else if (useLegacyFile) {
    return defaultTokenManager.checkRefreshTokenValidity();
  } else {
    console.warn('⚠️ Token validation requires database or file mode. Returning false.');
    return Promise.resolve(false);
  }
};

/**
 * Get valid access token (used by GetMySellerList and EStocksStockAndPriceDBManager)
 * @returns {Promise<string>}
 */
export const getValidAccessToken = () => {
  if (useDatabase) {
    const appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME;
    if (appId) {
      return defaultTokenManager.getUserAccessTokenByAppId(appId);
    }
    return defaultTokenManager.getUserAccessToken('default');
  } else if (useLegacyFile) {
    return defaultTokenManager.getToken('default');
  } else {
    throw new Error('getValidAccessToken requires database or file mode');
  }
};