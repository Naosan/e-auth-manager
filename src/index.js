// @naosan/e-auth-manager - Main Entry Point
import LocalSharedTokenManager from './LocalSharedTokenManager.js';
import ApplicationAccessToken_ClientCredentialsManager from './ApplicationAccessToken_ClientCredentialsManager.js';
import UserAccessToken_AuthorizationCodeManager from './UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from './config.js';
import { EBAY_SCOPES, getScopeString, validateScopeSubset, getScopesForApiType } from './ebayScopes.js';

// Lazy initialization: do not load config or touch storage on import.
let cachedConfig = null;
let cachedDefaultTokenManager = null;

const getConfig = (options = {}) => {
  const shouldCache = !options || Object.keys(options).length === 0;
  if (shouldCache && cachedConfig) {
    return cachedConfig;
  }

  const config = loadConfig(options);
  if (shouldCache) {
    cachedConfig = config;
  }
  return config;
};

const getDefaultAccountName = () => {
  const config = getConfig();
  return config.defaultAccountName || 'default';
};

const getDefaultTokenManager = () => {
  if (cachedDefaultTokenManager) {
    return cachedDefaultTokenManager;
  }

  const config = getConfig();
  cachedDefaultTokenManager = new UserAccessToken_AuthorizationCodeManager(config);
  console.log('🔄 Using UserAccessToken_AuthorizationCodeManager with automatic dual storage (Database + Encrypted JSON)');
  return cachedDefaultTokenManager;
};

// Export classes for direct access if needed
export {
  LocalSharedTokenManager,
  ApplicationAccessToken_ClientCredentialsManager,
  UserAccessToken_AuthorizationCodeManager
};

// Export OAuth scope utilities for convenience
export { EBAY_SCOPES, getScopeString, validateScopeSubset, getScopesForApiType };

const resolveAppId = (maybeAppId, config) => {
  if (typeof maybeAppId === 'string' && maybeAppId.trim().length > 0) {
    return maybeAppId;
  }

  return config.defaultAppId ||
    process.env.EBAY_CLIENT_ID ||
    'default';
};

const buildLayerState = () => ({
  attempted: false,
  status: 'not_attempted',
  message: null,
  error: null
});

/**
 * Inspect refresh token health across storage layers
 * @param {string} [appId]
 * @returns {Promise<{appId: string, isValid: boolean, source: ('database'|'encrypted-json'|null), layers: { database: Object, encryptedJson: Object }}>} Detailed health information
 */
export const getRefreshTokenHealth = async (appId) => {
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
  const effectiveAppId = resolveAppId(appId, config);

  const health = {
    appId: effectiveAppId,
    isValid: false,
    source: null,
    layers: {
      database: buildLayerState(),
      encryptedJson: buildLayerState()
    }
  };

  const databaseLayer = health.layers.database;

  if (typeof defaultTokenManager.checkRefreshTokenValidity === 'function') {
    databaseLayer.attempted = true;
    try {
      const isValidInDb = await defaultTokenManager.checkRefreshTokenValidity(effectiveAppId);
      databaseLayer.status = isValidInDb ? 'valid' : 'invalid';
      if (isValidInDb) {
        health.isValid = true;
        health.source = 'database';
        databaseLayer.message = 'Valid refresh token found in database';
        return health;
      }
      databaseLayer.message = 'No valid refresh token found in database';
    } catch (error) {
      databaseLayer.status = 'error';
      databaseLayer.error = error?.message || String(error);
      databaseLayer.message = 'Database refresh token check failed';
    }
  } else {
    databaseLayer.status = 'not_available';
    databaseLayer.message = 'Database layer does not expose refresh token validity check';
  }

  const fileLayer = health.layers.encryptedJson;
  const fileManagerCheck = defaultTokenManager.fileTokenManager?.checkRefreshTokenValidity;

  if (typeof fileManagerCheck === 'function') {
    fileLayer.attempted = true;
    try {
      const isValidInFile = await fileManagerCheck.call(defaultTokenManager.fileTokenManager, effectiveAppId);
      fileLayer.status = isValidInFile ? 'valid' : 'invalid';
      if (isValidInFile) {
        health.isValid = true;
        health.source = 'encrypted-json';
        fileLayer.message = 'Valid refresh token found in encrypted JSON';
        return health;
      }
      fileLayer.message = 'No valid refresh token found in encrypted JSON cache';
    } catch (error) {
      fileLayer.status = 'error';
      fileLayer.error = error?.message || String(error);
      fileLayer.message = 'Encrypted JSON refresh token check failed';
    }
  } else {
    fileLayer.status = 'not_available';
    fileLayer.message = 'Encrypted JSON layer does not expose refresh token validity check';
  }

  return health;
};

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
  const config = getConfig();
  
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
  const config = getConfig();
  
  const manager = new ApplicationAccessToken_ClientCredentialsManager({ 
    ...config, 
    ...options,
    scope: options.scope || 'https://api.ebay.com/oauth/api_scope'
  });
  return manager.getApplicationAccessToken();
};

/**
 * Sell Metadata API 用の User Access Token 取得
 * 用途: マーケットプレイス/カテゴリ条件（conditionId, conditionName）取得など
 * OAuth2 Flow: Authorization Code Grant（ユーザー同意・リフレッシュトークンが必要）
 * @param {string} appId - eBay App ID
 * @returns {Promise<string>} - Sell Metadata 用 User Access Token
 */
export const getSellMetadataApiToken = (appId) => {
  console.log('🧭 Getting Sell Metadata API User Access Token');
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
  if (!appId) {
    appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME || process.env.EBAY_CLIENT_ID;
  }

  if (!appId) {
    console.warn('⚠️ No App ID provided for Sell Metadata; falling back to "default"');
    appId = 'default';
  }

  return defaultTokenManager.getUserAccessTokenByAppId(appId);
};

/**
 * Trading API専用のUser Access Token取得
 * 用途: 出品、入札、ユーザー固有操作
 * OAuth2 Flow: Authorization Code Grant
 * @param {string} appId - eBay App ID
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - Trading API用 User Access Token
 */
export const getTradingApiToken = (appId) => {
  console.log('🔑 Getting Trading API User Access Token');
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
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

/**
 * Marketing API専用のUser Access Token取得
 * 用途: プロモーション、キャンペーン管理などのマーケティング機能
 * OAuth2 Flow: Authorization Code Grant（事前にsell.marketing系スコープで同意済みのリフレッシュトークンが必要）
 * @param {string|Object} appId - eBay App ID もしくはオプションオブジェクト（互換用）
 * @param {Object} [options]
 * @param {boolean} [options.readOnly=false] - 読み取り専用スコープを要求するかどうか
 * @param {boolean} [options.forceRefresh=false] - 常にリフレッシュトークンで再発行するかどうか
 * @param {string|string[]} [options.scope] - カスタムスコープを明示する場合に使用
 * @returns {Promise<string>} Marketing API用 User Access Token
 */
export const getMarketingApiToken = async (appId, options = {}) => {
  console.log('📣 Getting Marketing API User Access Token');
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();

  // Backward compatibility: first argument can be options object
  if (typeof appId === 'object' && appId !== null) {
    options = appId;
    appId = undefined;
  }

  const {
    readOnly = false,
    forceRefresh = false,
    scope: scopeOverride
  } = options;

  let effectiveAppId = appId ||
    config.defaultAppId ||
    process.env.EBAY_DEFAULT_APP_ID ||
    process.env.EBAY_API_APP_NAME ||
    process.env.EBAY_CLIENT_ID;

  if (!effectiveAppId) {
    console.warn('⚠️ No App ID provided for Marketing API; falling back to "default"');
    effectiveAppId = 'default';
  }

  let effectiveScopeString = '';
  if (Array.isArray(scopeOverride) && scopeOverride.length > 0) {
    effectiveScopeString = getScopeString(scopeOverride);
  } else if (typeof scopeOverride === 'string' && scopeOverride.trim().length > 0) {
    effectiveScopeString = scopeOverride.trim();
  } else {
    const presetScopes = readOnly ? EBAY_SCOPES.MARKETING_READONLY : EBAY_SCOPES.MARKETING_FULL;
    effectiveScopeString = getScopeString(presetScopes);
  }

  if (!forceRefresh) {
    return defaultTokenManager.getUserAccessTokenByAppId(effectiveAppId);
  }

  if (typeof defaultTokenManager.getTokenByAppId !== 'function' ||
      typeof defaultTokenManager.renewUserAccessTokenByAppId !== 'function') {
    console.warn('⚠️ Current token manager does not support forced refresh; returning existing token.');
    return defaultTokenManager.getUserAccessTokenByAppId(effectiveAppId);
  }

  const tokenData = await defaultTokenManager.getTokenByAppId(effectiveAppId);
  if (!tokenData) {
    throw new Error(`No token found for App ID: ${effectiveAppId}. Seed a refresh token before requesting Marketing API access.`);
  }

  const refreshOptions = effectiveScopeString
    ? { scope: effectiveScopeString }
    : {};

  const refreshed = await defaultTokenManager.renewUserAccessTokenByAppId(
    effectiveAppId,
    tokenData,
    refreshOptions
  );

  if (refreshed?.access_token) {
    return refreshed.access_token;
  }

  // Fallback: return the stored token after refresh
  return defaultTokenManager.getUserAccessTokenByAppId(effectiveAppId);
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
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
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
export const getUserAccessToken = (accountName) => {
  const config = getConfig();
  const defaultAccountName = getDefaultAccountName();
  const defaultTokenManager = getDefaultTokenManager();
  const effectiveAccountName = (typeof accountName === 'string' && accountName.trim().length > 0)
    ? accountName
    : defaultAccountName;
  // Always use database-based manager with automatic dual storage
  // Try Default App ID first if no specific account name provided
  if (effectiveAccountName === defaultAccountName) {
    const appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME;
    if (appId) {
      return defaultTokenManager.getUserAccessTokenByAppId(appId).catch(() => {
        return defaultTokenManager.getUserAccessToken(defaultAccountName);
      });
    }
  }
  return defaultTokenManager.getUserAccessToken(effectiveAccountName);
};

/**
 * Initialize token manager
 * @returns {Promise<void>}
 */
export const initialize = () => {
  const defaultTokenManager = getDefaultTokenManager();
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
export const checkRefreshTokenValidity = async (appId) => {
  const health = await getRefreshTokenHealth(appId);
  const { database, encryptedJson } = health.layers;

  if (health.isValid) {
    if (health.source === 'database') {
      console.log(`✅ Refresh token valid in database for App ID: ${health.appId}`);
    } else if (health.source === 'encrypted-json') {
      console.log(`✅ Refresh token valid in encrypted JSON (fallback) for App ID: ${health.appId}`);
    }
    return true;
  }

  if (database.status === 'invalid') {
    console.warn(`⚠️ No valid refresh token found in database for App ID: ${health.appId}`);
  } else if (database.status === 'error') {
    console.warn(`⚠️ Database refresh token check failed for ${health.appId}: ${database.error}`);
  } else if (database.status === 'not_available') {
    console.warn('⚠️ Database refresh token check is not available in the current token manager implementation.');
  }

  if (encryptedJson.status === 'invalid') {
    console.warn(`⚠️ No valid refresh token found in encrypted JSON for App ID: ${health.appId}`);
  } else if (encryptedJson.status === 'error') {
    console.warn(`⚠️ Encrypted JSON refresh token check failed: ${encryptedJson.error}`);
  } else if (encryptedJson.status === 'not_available') {
    console.warn('⚠️ Encrypted JSON refresh token check is not available in the current token manager implementation.');
  }

  console.error(`❌ No valid refresh token found in database or encrypted JSON for App ID: ${health.appId}`);
  return false;
};

/**
 * Get a valid **User Access Token** for eBay API calls
 * - Returns a fresh User Access Token, automatically refreshing via Refresh Token if expired
 * - User Access Tokens are short-lived (≈2 hours) and required for all account-specific operations
 * @returns {Promise<string>} Valid User Access Token for API requests
 */
export const getValidAccessToken = () => {
  const config = getConfig();
  const defaultAccountName = getDefaultAccountName();
  const defaultTokenManager = getDefaultTokenManager();
  // Always use database-based manager with automatic dual storage
  const appId = config.defaultAppId || process.env.EBAY_DEFAULT_APP_ID || process.env.EBAY_API_APP_NAME;
  if (appId) {
    return defaultTokenManager.getUserAccessTokenByAppId(appId);
  }
  return defaultTokenManager.getUserAccessToken(defaultAccountName);
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
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
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
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
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
  const config = getConfig();
  const defaultTokenManager = getDefaultTokenManager();
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
