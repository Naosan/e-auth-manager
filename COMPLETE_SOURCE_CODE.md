# eBay OAuth Token Manager - Complete Source Code

## Overview
This is a comprehensive Node.js library for managing eBay OAuth 2.0 tokens with a sophisticated multi-layered architecture featuring:
- **Zero Configuration**: Automatic dual storage (SQLite + encrypted JSON)
- **Performance Optimized**: 4-layer token retrieval system
- **API-Specific Functions**: Dedicated token managers for different eBay APIs
- **Security First**: AES-256-GCM encryption for database, AES-256-CBC for file storage

## Architecture
1. **UserAccessToken_AuthorizationCodeManager** - Manages User Access Tokens for Trading API
2. **ApplicationAccessToken_ClientCredentialsManager** - Manages Application Access Tokens for Browse API
3. **LocalSharedTokenManager** - File-based cross-project token sharing with encryption
4. **4-Layer Token Retrieval**: Memory → JSON → Database → eBay API

## eBay Token Types (Officially Supported)

### Application Access Token
- **Aliases**: App Token, Client Credentials Token
- **Flow**: Client Credentials Grant
- **Use Cases**: Public data access (Browse API, Taxonomy API)
- **Characteristics**: Short-lived (~2 hours), account-independent
- **APIs**: getBrowseApiToken(), getTaxonomyApiToken()

### User Access Token
- **Aliases**: OAuth User Token, Authorization Code Token  
- **Flow**: Authorization Code Grant (+ Refresh Token renewal)
- **Use Cases**: Account-specific operations (listing, orders, inventory)
- **Characteristics**: Short-lived (~2 hours), renewable via Refresh Token (18 months)
- **APIs**: getTradingApiToken(), getUserAccessTokenByAppId()

---

## src/index.js - Main Entry Point

```javascript
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
  return defaultTokenManager.checkRefreshTokenValidity();
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
```

---

## src/ApplicationAccessToken_ClientCredentialsManager.js - Application Token Management

```javascript
// ApplicationAccessToken_ClientCredentialsManager.js - eBay Application Access Token Management (client_credentials grant)
import axios from 'axios';

class ApplicationAccessToken_ClientCredentialsManager {
  constructor(options = {}) {
    // Validate required options
    if (!options.clientId) {
      throw new Error('clientId is required. Pass it as option or set EBAY_CLIENT_ID environment variable.');
    }
    if (!options.clientSecret) {
      throw new Error('clientSecret is required. Pass it as option or set EBAY_CLIENT_SECRET environment variable.');
    }

    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.tokenUrl = options.tokenUrl || 'https://api.ebay.com/identity/v1/oauth2/token';
    this.scope = options.scope || 'https://api.ebay.com/oauth/api_scope';
    
    // In-memory cache for performance
    this.memoryCache = {
      token: null,
      expiration: null
    };
  }

  async getApplicationAccessToken() {
    try {
      // Check memory cache first
      if (this.memoryCache.token && this.memoryCache.expiration > Date.now()) {
        console.log('✅ Using cached Application Access Token');
        return this.memoryCache.token;
      }

      console.log('🔄 Getting new Application Access Token from eBay API...');

      // Need to renew token
      const tokenData = await this.renewApplicationAccessToken();
      
      // Update memory cache
      this.updateMemoryCache(tokenData.accessToken, tokenData.expiresIn);

      return tokenData.accessToken;
    } catch (error) {
      console.error('🚨 Failed to get valid access token:', error.message);
      throw error;
    }
  }

  async renewApplicationAccessToken() {
    try {
      console.log('🔄 Renewing Application Access Token...');
      
      // Log basic info (without sensitive data)
      console.log('Client ID:', this.clientId?.substring(0, 10) + '...');
      console.log('Token URL:', this.tokenUrl);
      console.log('Scope:', this.scope);

      // Prepare OAuth request
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      console.log('Auth header:', `Basic ${auth.substring(0, 20)}...`);

      const response = await axios.post(
        this.tokenUrl,
        `grant_type=client_credentials&scope=${encodeURIComponent(this.scope)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`,
          }
        }
      );

      const data = response.data;
      console.log('✅ Application Access Token renewed successfully');
      console.log('Token Type:', data.token_type);
      console.log('Expires In:', data.expires_in, 'seconds');

      return {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in,
        scope: data.scope || this.scope,
        accessTokenUpdatedDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('🚨 Failed to renew Application Access Token:', error.message);
      if (error.response?.data) {
        console.error('eBay API error response:', error.response.data);
      }
      throw new Error(`eBay token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  updateMemoryCache(token, expiresIn) {
    this.memoryCache.token = token;
    // Cache expires 60 seconds before actual token expiration
    this.memoryCache.expiration = Date.now() + (expiresIn - 60) * 1000;
  }

  isExpired(tokenData) {
    if (!tokenData.expiresIn || !tokenData.accessTokenUpdatedDate) {
      return true;
    }

    const updatedTime = new Date(tokenData.accessTokenUpdatedDate).getTime();
    const expirationTime = updatedTime + (tokenData.expiresIn * 1000);
    
    return Date.now() > expirationTime;
  }
}

export default ApplicationAccessToken_ClientCredentialsManager;
```

---

## src/LocalSharedTokenManager.js - File-Based Token Storage

```javascript
// LocalSharedTokenManager.js - File-based eBay Token Management with AES-256-CBC Encryption
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

class LocalSharedTokenManager {
  constructor(options = {}) {
    // Validate required options for security
    if (!options.masterKey) {
      throw new Error('masterKey is required for LocalSharedTokenManager. Pass it as option or set EBAY_MASTER_KEY environment variable.');
    }

    // Token file path - configurable, uses platform-specific secure directories
    this.tokenFile = options.tokenFilePath || path.join(
      process.env.PROGRAMDATA || process.env.HOME || process.env.USERPROFILE || '/tmp',
      'EStocks/tokens/ebay-tokens.encrypted.json'
    );
    this.lockFile = `${this.tokenFile}.lock`;
    
    // Encryption configuration
    this.masterKey = options.masterKey;
    this.encryptionKey = this.deriveEncryptionKey();
  }

  async getToken(appId) {
    const release = await this.acquireLock();
    try {
      const data = await this.readTokenFile();
      const token = data.tokens[appId];
      
      if (!token) {
        console.error(`🚨 Token not found for app: ${appId}`);
        return null;
      }

      if (this.isExpired(token)) {
        console.warn(`⚠️ Token expired for app: ${appId}`);
        return null;
      }

      return token;
    } finally {
      await release();
    }
  }

  async saveToken(appId, tokenData) {
    const release = await this.acquireLock();
    try {
      const current = await this.readTokenFile();
      current.tokens[appId] = {
        ...tokenData,
        lastUpdated: new Date().toISOString()
      };
      await this.saveTokenFile(current);
    } finally {
      await release();
    }
  }

  async readTokenFile() {
    try {
      const data = await fs.readFile(this.tokenFile, 'utf8');
      return this.decryptData(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty structure
        console.log('📝 Token file not found, creating new one...');
        return { tokens: {} };
      }
      
      // Check if it's a decryption error (wrong key or corrupted file)
      if (error.message.includes('Unsupported state') || error.message.includes('authenticate data')) {
        console.warn('⚠️ Decryption failed (possibly different key), creating new token file...');
        
        // Backup corrupted file
        try {
          await fs.rename(this.tokenFile, `${this.tokenFile}.backup.${Date.now()}`);
        } catch (backupError) {
          console.warn('⚠️ Could not backup corrupted file:', backupError.message);
        }
        return { tokens: {} };
      }
      
      console.error('🚨 Failed to read token file:', error.message);
      throw error;
    }
  }

  async saveTokenFile(data) {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.tokenFile), { recursive: true });
      
      const tempFile = `${this.tokenFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(this.encryptData(data), null, 2));
      await fs.rename(tempFile, this.tokenFile);
      console.log('✅ Token file saved successfully');
    } catch (error) {
      console.error('🚨 Failed to save token file:', error.message);
      throw error;
    }
  }

  encryptData(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
      
      const jsonString = JSON.stringify(data);
      const encrypted = Buffer.concat([
        cipher.update(jsonString, 'utf8'),
        cipher.final()
      ]);
      
      return {
        version: '1.0',
        encrypted: true,
        algorithm: 'aes-256-cbc',
        data: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('🚨 Failed to encrypt data:', error.message);
      throw error;
    }
  }

  decryptData(encryptedData) {
    if (!encryptedData.encrypted) {
      // Plain data, return as-is (for backward compatibility)
      return encryptedData;
    }

    try {
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const encrypted = Buffer.from(encryptedData.data, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      console.error('🚨 Failed to decrypt data:', error.message);
      throw error;
    }
  }

  // Process-safe file locking mechanism
  async acquireLock() {
    const maxAttempts = 10;
    const retryDelay = 100;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const pid = process.pid.toString();
        await fs.writeFile(this.lockFile, pid, { flag: 'wx' });
        
        // Return release function
        return async () => {
          try {
            // Verify we still own the lock
            const currentPid = await fs.readFile(this.lockFile, 'utf8');
            if (currentPid === pid) {
              await fs.unlink(this.lockFile);
            }
          } catch (error) {
            // Lock might have been cleaned up already
          }
        };
      } catch (error) {
        if (error.code === 'EEXIST') {
          // Lock exists, wait and retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Failed to acquire lock after maximum attempts');
  }

  deriveEncryptionKey() {
    try {
      const masterKey = this.masterKey;
      const machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'default-machine';
      
      return crypto.scryptSync(
        masterKey + machineId,
        'ebay-research-salt-v1',
        32
      );
    } catch (error) {
      console.error('🚨 Failed to derive encryption key:', error.message);
      throw error;
    }
  }

  isExpired(token) {
    if (!token.expiresIn || !token.accessTokenUpdatedDate) {
      return true;
    }

    const updatedTime = new Date(token.accessTokenUpdatedDate).getTime();
    const expirationTime = updatedTime + (token.expiresIn * 1000);
    
    return Date.now() > expirationTime;
  }

  /**
   * Check if User Refresh Token is expired
   */
  isRefreshTokenExpired(token, bufferSeconds = 86400 * 7) {
    if (!token.refreshTokenExpiresIn || !token.refreshTokenUpdatedDate) {
      return true;
    }

    const updatedTime = new Date(token.refreshTokenUpdatedDate).getTime();
    const expirationTime = updatedTime + (token.refreshTokenExpiresIn * 1000);
    
    return Date.now() > (expirationTime - bufferSeconds * 1000);
  }

  /**
   * Check User Refresh Token validity for cross-project compatibility
   * @returns {Promise<boolean>} - true if User Refresh Token is valid, false if expired
   */
  async checkRefreshTokenValidity() {
    try {
      console.log('🔍 Checking User Refresh Token validity (LocalSharedTokenManager)...');
      
      const data = await this.readTokenFile();
      
      // Check all tokens for any valid User Refresh Token
      const tokenIds = Object.keys(data.tokens);
      if (tokenIds.length === 0) {
        console.warn('⚠️ No tokens found in file');
        return false;
      }

      // Try default first, then any other token
      const checkOrder = ['default', ...tokenIds.filter(id => id !== 'default')];
      
      for (const tokenId of checkOrder) {
        const token = data.tokens[tokenId];
        if (!token) continue;

        const isRefreshExpired = this.isRefreshTokenExpired(token);
        
        if (!isRefreshExpired) {
          console.log(`✅ Valid User Refresh Token found for: ${tokenId}`);
          return true;
        }
      }

      console.error('❌ All User Refresh Tokens are expired');
      return false;
    } catch (error) {
      console.error('🚨 Failed to check User Refresh Token validity:', error.message);
      return false;
    }
  }
}

export default LocalSharedTokenManager;
```

---

## Key Features Demonstrated

### 1. **4-Layer Token Retrieval System**
```javascript
// Implemented in UserAccessToken_AuthorizationCodeManager
// Layer 1: Memory cache (~1ms)
// Layer 2: LocalSharedTokenManager JSON file (~10ms)  
// Layer 3: SQLite database (~50ms)
// Layer 4: eBay API refresh (~500ms)
```

### 2. **Automatic Dual Storage**
```javascript
// Constructor automatically initializes LocalSharedTokenManager
this.fileTokenManager = new LocalSharedTokenManager({
  masterKey: options.masterKey || 'default-secure-key-for-local-storage',
  tokenFilePath: options.tokenFilePath
});
```

### 3. **Platform-Specific Secure Directories**
```javascript
// From LocalSharedTokenManager
this.tokenFile = options.tokenFilePath || path.join(
  process.env.PROGRAMDATA || process.env.HOME || process.env.USERPROFILE || '/tmp',
  'EStocks/tokens/ebay-tokens.encrypted.json'
);
```

### 4. **AES-256-GCM Encryption (Database)**
```javascript
// Database tokens use GCM for better security
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
return `aes-256-gcm:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
```

### 5. **AES-256-CBC Encryption (File Storage)**
```javascript
// File tokens use CBC for compatibility
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
```

### 6. **Comprehensive Logging with Token Type Clarity**
```javascript
// Clear distinction between token types in all logs
console.log('🔑 Getting Browse API Application Access Token');
console.log('🔑 Getting Trading API User Access Token');
console.log('✅ User Refresh Token is valid');
```

## Important Constraints

⚠️ **Critical Limitation**: User Refresh Tokens cannot be generated programmatically via API. They must be obtained through manual browser-based OAuth flow. This library manages them once obtained, but cannot generate them automatically.

## Token Type Clarity

### Application Access Tokens (Public APIs)
- **getBrowseApiToken()** - For product search, item details
- **getTaxonomyApiToken()** - For category hierarchies, metadata
- Short-lived (~2 hours), no refresh mechanism needed

### User Access Tokens (Account-Specific APIs)  
- **getTradingApiToken()** - For listing, bidding, account operations
- **getUserTokenInfo()** - Get User token metadata
- **getUserTokenExpiration()** - Check User token expiration
- **getUserAccountName()** - Get associated eBay account name
- Short-lived (~2 hours), renewable via User Refresh Token

## Usage Examples

```javascript
import { 
  getTradingApiToken, 
  getBrowseApiToken, 
  getUserTokenInfo,
  checkRefreshTokenValidity 
} from 'ebay-oauth-token-manager';

// Application Access Tokens (public data)
const browseToken = await getBrowseApiToken();
const taxonomyToken = await getTaxonomyApiToken();

// User Access Tokens (account-specific)
const tradingToken = await getTradingApiToken('your-app-id');

// User token information and validation
const tokenInfo = await getUserTokenInfo('your-app-id');
console.log(`User token expires at: ${tokenInfo.expires_at}`);
console.log(`eBay account: ${tokenInfo.account_name}`);

const isValid = await checkRefreshTokenValidity('your-app-id');
console.log(`User Refresh Token valid: ${isValid}`);
```

## Storage Locations

- **Windows**: `%PROGRAMDATA%\\EStocks\\tokens\\ebay-tokens.encrypted.json`
- **Linux/Mac**: `$HOME/EStocks/tokens/ebay-tokens.encrypted.json`  
- **SQLite DB**: `./database/ebay_tokens.sqlite`

## src/config.js - Configuration Management

```javascript
// Configuration management for eBay OAuth Token Manager
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load .env from package root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

/**
 * Load configuration from environment variables and config files
 * @param {Object} options - Override options
 * @returns {Object} Configuration object
 */
export function loadConfig(options = {}) {
  // Validate required environment variables
  const requiredVars = ['EBAY_CLIENT_ID', 'EBAY_CLIENT_SECRET'];
  const missing = requiredVars.filter(varName => !process.env[varName] && !options[varName.toLowerCase().replace('ebay_', '')]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nPlease set these variables or pass them as options.`);
  }

  const config = {
    // eBay API Credentials (REQUIRED)
    clientId: options.clientId || process.env.EBAY_CLIENT_ID,
    clientSecret: options.clientSecret || process.env.EBAY_CLIENT_SECRET,
    
    // Optional configuration
    defaultAppId: options.defaultAppId || process.env.EBAY_CLIENT_ID,
    environment: options.environment || process.env.EBAY_ENVIRONMENT || 'PRODUCTION',
    
    // Token storage configuration
    useDatabase: options.useDatabase ?? (process.env.EBAY_USE_DATABASE_TOKENS === 'true'),
    useLegacyFile: options.useLegacyFile ?? (process.env.EBAY_USE_LEGACY_TOKENS === 'true'),
    
    // Database configuration
    databasePath: options.databasePath || process.env.EBAY_DATABASE_PATH || './database/ebay_tokens.sqlite',
    
    // File-based token storage configuration
    tokenFilePath: options.tokenFilePath || process.env.EBAY_TOKEN_FILE_PATH,
    
    // Encryption configuration
    encryptionEnabled: options.encryptionEnabled ?? true,
    masterKey: options.masterKey || process.env.EBAY_MASTER_KEY,
    
    // API URLs (usually don't need to change)
    tokenUrl: options.tokenUrl || 'https://api.ebay.com/identity/v1/oauth2/token',
    scope: options.scope || 'https://api.ebay.com/oauth/api_scope'
  };

  // Validate encryption key if encryption is enabled
  if (config.encryptionEnabled && !config.masterKey) {
    throw new Error('EBAY_MASTER_KEY environment variable is required when encryption is enabled. Set EBAY_MASTER_KEY or pass masterKey option.');
  }

  return config;
}

/**
 * Get default configuration for examples and testing
 * @returns {Object} Example configuration
 */
export function getExampleConfig() {
  return {
    clientId: 'your_ebay_client_id',
    clientSecret: 'your_ebay_client_secret',
    defaultAppId: 'your_default_app_id',
    masterKey: 'your_secure_master_key_change_me',
    useDatabase: true,
    encryptionEnabled: true,
    environment: 'PRODUCTION'
  };
}
```

---

## src/ebayScopes.js - OAuth Scope Management

```javascript
// ebayScopes.js - Centralized eBay OAuth Scope Definitions
// This file contains all eBay OAuth scope configurations for different APIs and use cases

/**
 * eBay OAuth Scope Definitions
 * 
 * Trading API: Traditional XML-based API that doesn't require OAuth scopes
 * REST APIs: Modern APIs that require specific OAuth scopes for access
 * 
 * Reference: https://developer.ebay.com/api-docs/static/oauth-scopes.html
 */
export const EBAY_SCOPES = {
  // Trading API - No scopes required
  TRADING_API: [],
  
  // Basic API access
  REST_API_BASIC: [
    'https://api.ebay.com/oauth/api_scope'
  ],
  
  // Seller APIs - Read Only
  SELL_READONLY: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'
  ],
  
  // Seller APIs - Full Access
  SELL_FULL: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
    'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
    'https://api.ebay.com/oauth/api_scope/sell.reputation',
    'https://api.ebay.com/oauth/api_scope/sell.stores'
  ],
  
  // Buy APIs
  BUY_APIS: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights'
  ],
  
  // Commerce APIs
  COMMERCE_APIS: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly'
  ],
  
  // Custom scope combinations for specific applications
  PRICE_OPTIMIZER: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.marketing'
  ],
  
  STOCK_MONITOR: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly'
  ]
};

/**
 * Get scope string for OAuth requests
 * @param {Array<string>} scopes - Array of scope URLs
 * @returns {string} Space-separated scope string
 */
export function getScopeString(scopes) {
  if (!scopes || scopes.length === 0) {
    return '';
  }
  return scopes.join(' ');
}

/**
 * Validate if requested scopes are subset of granted scopes
 * @param {Array<string>} requestedScopes - Scopes being requested
 * @param {Array<string>} grantedScopes - Originally granted scopes
 * @returns {boolean} True if valid subset
 */
export function validateScopeSubset(requestedScopes, grantedScopes) {
  if (!requestedScopes || requestedScopes.length === 0) {
    return true; // Empty scope request is always valid
  }
  
  return requestedScopes.every(scope => grantedScopes.includes(scope));
}

/**
 * Get appropriate scopes for API type
 * @param {string} apiType - Type of API ('trading', 'rest', 'sell', 'buy')
 * @param {boolean} readOnly - Whether to use read-only scopes
 * @returns {Array<string>} Array of scope URLs
 */
export function getScopesForApiType(apiType, readOnly = false) {
  switch (apiType.toLowerCase()) {
    case 'trading':
      return EBAY_SCOPES.TRADING_API;
    case 'rest':
      return EBAY_SCOPES.REST_API_BASIC;
    case 'sell':
      return readOnly ? EBAY_SCOPES.SELL_READONLY : EBAY_SCOPES.SELL_FULL;
    case 'buy':
      return EBAY_SCOPES.BUY_APIS;
    case 'commerce':
      return EBAY_SCOPES.COMMERCE_APIS;
    default:
      return EBAY_SCOPES.REST_API_BASIC;
  }
}

// Export default for backward compatibility
export default EBAY_SCOPES;
```

---

This library provides a robust, secure, and performant solution for eBay OAuth 2.0 token management with enterprise-grade features like encryption, caching, and automatic failover.

---

## src/UserAccessToken_AuthorizationCodeManager.js - Core User Token Management

```javascript
// UserAccessToken_AuthorizationCodeManager.js - SQLite Database-based eBay User Access Token Management (authorization_code grant)
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import LocalSharedTokenManager from './LocalSharedTokenManager.js';

class UserAccessToken_AuthorizationCodeManager {
  constructor(options = {}) {
    // Validate required options
    if (!options.clientId) {
      throw new Error('clientId is required. Pass it as option or set EBAY_CLIENT_ID environment variable.');
    }
    if (!options.clientSecret) {
      throw new Error('clientSecret is required. Pass it as option or set EBAY_CLIENT_SECRET environment variable.');
    }

    // Database path - configurable
    this.dbPath = options.databasePath || path.resolve('./database/ebay_tokens.sqlite');
    
    // eBay API credentials
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.tokenUrl = options.tokenUrl || 'https://api.ebay.com/identity/v1/oauth2/token';
    this.encryptionEnabled = options.encryptionEnabled ?? true;
    
    // Default App ID for database searches (prioritized over clientId)
    this.defaultAppId = options.defaultAppId || this.clientId;
    
    // Database connection (lazy initialization)
    this.db = null;
    
    // In-memory cache for performance
    this.memoryCache = new Map();
    this.cacheExpiration = new Map();
    
    // Encryption key for token storage
    if (this.encryptionEnabled) {
      if (!options.masterKey) {
        throw new Error('masterKey is required when encryption is enabled. Pass it as option or set EBAY_MASTER_KEY environment variable.');
      }
      this.masterKey = options.masterKey;
      this.encryptionKey = this.deriveEncryptionKey();
    }
    
    // Always initialize LocalSharedTokenManager for dual storage (no environment variable needed)
    // This provides fast JSON access and automatic backup
    try {
      this.fileTokenManager = new LocalSharedTokenManager({
        masterKey: options.masterKey || 'default-secure-key-for-local-storage',
        tokenFilePath: options.tokenFilePath
      });
      console.log('🔄 Dual storage enabled automatically: Database + Encrypted JSON file');
    } catch (error) {
      console.warn('⚠️ Could not initialize file token manager, using database only:', error.message);
      this.fileTokenManager = null;
    }
  }

  /**
   * Get database connection (lazy initialization)
   */
  async getDb() {
    if (!this.db) {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      await import('fs/promises').then(fs => fs.mkdir(dbDir, { recursive: true }));
      
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });
      
      // Enable foreign keys and WAL mode for better performance
      await this.db.exec('PRAGMA foreign_keys = ON');
      await this.db.exec('PRAGMA journal_mode = WAL');
      
      // Create table if it doesn't exist
      await this.initializeDatabase();
    }
    return this.db;
  }

  /**
   * Initialize database schema
   */
  async initializeDatabase() {
    const db = await this.getDb();
    await db.exec(\`
      CREATE TABLE IF NOT EXISTS ebay_oauth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'oauth',
        account_name TEXT NOT NULL UNIQUE,
        app_id TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token_updated_date TEXT NOT NULL,
        expires_in INTEGER NOT NULL,
        refresh_token_updated_date TEXT NOT NULL,
        refresh_token_expires_in INTEGER NOT NULL DEFAULT 47304000,
        token_type TEXT DEFAULT 'Bearer',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    \`);
    
    // Create index for app_id lookups
    await db.exec(\`
      CREATE INDEX IF NOT EXISTS idx_ebay_oauth_tokens_app_id 
      ON ebay_oauth_tokens(app_id)
    \`);
  }

  /**
   * Get valid User Access Token by App ID (preferred method)
   * Priority: Memory Cache → JSON File → Database → Refresh from eBay
   */
  async getUserAccessTokenByAppId(appId) {
    try {
      console.log(\`🔍 Checking token for App ID: \${appId}\`);
      
      // 1. Check memory cache first (fastest ~1ms)
      const cacheKey = \`token_appid_\${appId}\`;
      if (this.memoryCache.has(cacheKey)) {
        const cachedToken = this.memoryCache.get(cacheKey);
        const expiration = this.cacheExpiration.get(cacheKey);
        
        if (Date.now() < expiration) {
          console.log(\`✅ Using cached token for App ID \${appId}\`);
          return cachedToken;
        } else {
          // Remove expired cache
          this.memoryCache.delete(cacheKey);
          this.cacheExpiration.delete(cacheKey);
          console.log(\`🗑️ Removed expired cache for App ID \${appId}\`);
        }
      }

      // 2. Check JSON file second (fast ~10ms)
      if (this.fileTokenManager) {
        try {
          const jsonToken = await this.fileTokenManager.getToken(appId);
          if (jsonToken && jsonToken.accessToken) {
            // Check if access token is not expired (2 hours = 7200 seconds)
            const tokenAge = Date.now() - new Date(jsonToken.accessTokenUpdatedDate).getTime();
            const expiresIn = (jsonToken.expiresIn || 7200) * 1000; // Convert to milliseconds
            
            if (tokenAge < expiresIn - 300000) { // 5 minutes buffer
              console.log(\`📁 Using token from JSON file for App ID \${appId}\`);
              
              // Cache in memory for next time
              this.memoryCache.set(cacheKey, jsonToken.accessToken);
              this.cacheExpiration.set(cacheKey, Date.now() + expiresIn - tokenAge);
              
              return jsonToken.accessToken;
            } else {
              console.log(\`⏰ JSON file token expired for App ID \${appId}, will refresh\`);
            }
          }
        } catch (fileError) {
          console.log(\`📁 Could not read from JSON file: \${fileError.message}\`);
        }
      }

      // 3. Get token from database third (~50ms)
      console.log(\`🗄️ Getting token from database for App ID: \${appId}\`);
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        // Fallback: Try to get by default account name if App ID matches
        if (appId === this.clientId) {
          console.log(\`🔄 App ID matches client ID, trying default account fallback...\`);
          return await this.getUserAccessToken('default');
        }
        throw new Error(\`No token found for App ID: \${appId}\`);
      }

      // 4. Check if access token is expired and refresh via eBay API (~500ms)
      if (this.isAccessTokenExpired(tokenData)) {
        console.log(\`⚠️ Access token expired for App ID \${appId}, refreshing via eBay API...\`);
        await this.renewUserAccessTokenByAppId(appId, tokenData);
        // Get updated token data
        const refreshedTokenData = await this.getTokenByAppId(appId);
        if (refreshedTokenData) {
          const decryptedToken = this.decryptToken(refreshedTokenData.access_token);
          this.updateMemoryCache(\`appid_\${appId}\`, decryptedToken, refreshedTokenData.expires_in);
          return decryptedToken;
        }
      } else {
        const decryptedToken = this.decryptToken(tokenData.access_token);
        this.updateMemoryCache(\`appid_\${appId}\`, decryptedToken, tokenData.expires_in);
        return decryptedToken;
      }
    } catch (error) {
      console.error(\`🚨 Failed to get valid User Access Token for App ID \${appId}:\`, error.message);
      throw error;
    }
  }

  /**
   * Refresh User Access Token by App ID using Refresh Token
   */
  async renewUserAccessTokenByAppId(appId, tokenData, options = {}) {
    try {
      console.log(\`🔄 Refreshing User Access Token for App ID: \${appId}\`);

      // Decrypt refresh token
      const refreshToken = this.decryptToken(tokenData.refresh_token);

      // Prepare OAuth request
      const auth = Buffer.from(\`\${this.clientId}:\${this.clientSecret}\`).toString('base64');
      const now = new Date().toISOString();

      let requestBody = \`grant_type=refresh_token&refresh_token=\${encodeURIComponent(refreshToken)}\`;
      
      // Add scope if provided
      if (options.scope) {
        requestBody += \`&scope=\${encodeURIComponent(options.scope)}\`;
      }

      const response = await axios.post(
        this.tokenUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': \`Basic \${auth}\`,
          }
        }
      );

      const data = response.data;

      // Update token data in database by account name (since saveUserAccessToken uses account_name)
      await this.saveUserAccessToken(tokenData.account_name, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        accessTokenUpdatedDate: now,
        refreshTokenUpdatedDate: data.refresh_token ? now : tokenData.refresh_token_updated_date,
        expiresIn: data.expires_in,
        refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
        tokenType: data.token_type || 'Bearer'
      });

      console.log(\`✅ User Access Token refreshed successfully for App ID \${appId} (\${tokenData.account_name})\`);
      
      // Clear related caches
      this.memoryCache.delete(\`token_appid_\${appId}\`);
      this.cacheExpiration.delete(\`token_appid_\${appId}\`);
      this.memoryCache.delete(\`token_\${tokenData.account_name}\`);
      this.cacheExpiration.delete(\`token_\${tokenData.account_name}\`);
      
      return data;
    } catch (error) {
      console.error(\`🚨 Failed to refresh User Access Token for App ID \${appId}:\`, error.message);
      if (error.response?.data) {
        console.error('eBay API error response:', error.response.data);
      }
      throw new Error(\`eBay token refresh failed: \${error.response?.data?.error_description || error.message}\`);
    }
  }

  /**
   * Check if User Refresh Token is expired
   */
  isRefreshTokenExpired(tokenData, bufferSeconds = 86400 * 7) {
    if (!tokenData.refresh_token_updated_date || !tokenData.refresh_token_expires_in) {
      return true;
    }

    const updatedTime = new Date(tokenData.refresh_token_updated_date).getTime();
    const expirationTime = updatedTime + (tokenData.refresh_token_expires_in * 1000);
    const currentTime = Date.now();
    
    return currentTime > (expirationTime - bufferSeconds * 1000);
  }

  /**
   * Derive encryption key for database token storage
   */
  deriveEncryptionKey() {
    const masterKey = this.masterKey;
    const machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'default-machine';
    
    return crypto.scryptSync(
      masterKey + machineId,
      'ebay-database-tokens-salt-v1',
      32
    );
  }

  /**
   * Encrypt token data with AES-256-GCM
   */
  encryptToken(tokenData) {
    if (!this.encryptionEnabled || !tokenData) {
      return tokenData;
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      cipher.setAAD(Buffer.from('ebay-token-data'));
      
      const encrypted = Buffer.concat([
        cipher.update(tokenData, 'utf8'),
        cipher.final()
      ]);
      
      const authTag = cipher.getAuthTag();

      // Return format: algorithm:iv:authTag:encryptedData (all base64)
      return \`aes-256-gcm:\${iv.toString('base64')}:\${authTag.toString('base64')}:\${encrypted.toString('base64')}\`;
    } catch (error) {
      console.error('🚨 Failed to encrypt token:', error.message);
      return tokenData;
    }
  }

  /**
   * Decrypt token data
   */
  decryptToken(encryptedData) {
    if (!this.encryptionEnabled || !encryptedData) {
      return encryptedData;
    }

    try {
      // Check if data is encrypted (has our format)
      if (!encryptedData.includes(':')) {
        // Plain text token, return as-is
        return encryptedData;
      }

      const parts = encryptedData.split(':');
      if (parts.length !== 4 || parts[0] !== 'aes-256-gcm') {
        // Not our encrypted format, return as-is
        return encryptedData;
      }

      const [, ivBase64, authTagBase64, encryptedBase64] = parts;
      
      const iv = Buffer.from(ivBase64, 'base64');
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
      decipher.setAAD(Buffer.from('ebay-token-data'));
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('🚨 Failed to decrypt token:', error.message);
      // If decryption fails, return original data (might be plain text)
      return encryptedData;
    }
  }

  /**
   * Get comprehensive User Access Token information including metadata
   * @param {string} appId - The eBay App ID to get token info for
   * @returns {Promise<Object>} User token information object
   */
  async getUserTokenInfo(appId) {
    try {
      console.log(\`🔍 Getting token info for App ID: \${appId}\`);
      
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        throw new Error(\`No token found for App ID: \${appId}\`);
      }

      // Calculate expiration date
      const accessTokenUpdatedDate = new Date(tokenData.access_token_updated_date);
      const expiresAt = new Date(accessTokenUpdatedDate.getTime() + (tokenData.expires_in * 1000));
      
      // Decrypt tokens for return (be careful with sensitive data)
      const decryptedAccessToken = this.decryptToken(tokenData.access_token);
      const decryptedRefreshToken = this.decryptToken(tokenData.refresh_token);
      
      const tokenInfo = {
        access_token: decryptedAccessToken,
        refresh_token: decryptedRefreshToken,
        expires_at: expiresAt,
        account_name: tokenData.account_name,
        token_type: 'User Access Token',
        access_token_updated_date: accessTokenUpdatedDate,
        expires_in: tokenData.expires_in,
        refresh_token_updated_date: new Date(tokenData.refresh_token_updated_date),
        refresh_token_expires_in: tokenData.refresh_token_expires_in
      };

      console.log(\`✅ User Access Token info retrieved for account: \${tokenData.account_name}\`);
      return tokenInfo;
      
    } catch (error) {
      console.error(\`🚨 Failed to get User Access Token info for App ID \${appId}:\`, error.message);
      throw error;
    }
  }

  /**
   * Get User Access Token expiration information
   * @param {string} appId - The eBay App ID to check expiration for
   * @returns {Promise<Object>} User token expiration information object
   */
  async getUserTokenExpiration(appId) {
    try {
      console.log(\`⏰ Getting User Access Token expiration info for App ID: \${appId}\`);
      
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        throw new Error(\`No token found for App ID: \${appId}\`);
      }

      // Calculate expiration times
      const accessTokenUpdatedDate = new Date(tokenData.access_token_updated_date);
      const expiresAt = new Date(accessTokenUpdatedDate.getTime() + (tokenData.expires_in * 1000));
      const now = Date.now();
      const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000));
      
      // Calculate percentage remaining (0-100)
      const totalLifetime = tokenData.expires_in;
      const percentageRemaining = totalLifetime > 0 ? Math.max(0, Math.min(100, (expiresIn / totalLifetime) * 100)) : 0;
      
      const expirationInfo = {
        expiresAt: expiresAt,
        expiresIn: expiresIn,
        isExpired: this.isAccessTokenExpired(tokenData),
        percentageRemaining: Math.round(percentageRemaining * 100) / 100 // Round to 2 decimal places
      };

      console.log(\`✅ User Access Token expiration info: \${expiresIn}s remaining (\${percentageRemaining.toFixed(1)}%)\`);
      return expirationInfo;
      
    } catch (error) {
      console.error(\`🚨 Failed to get User Access Token expiration for App ID \${appId}:\`, error.message);
      throw error;
    }
  }

  /**
   * Get the eBay account name associated with a User Access Token
   * @param {string} appId - The eBay App ID to get account name for
   * @returns {Promise<string>} The eBay account name
   */
  async getUserAccountName(appId) {
    try {
      console.log(\`👤 Getting account name for App ID: \${appId}\`);
      
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        throw new Error(\`No token found for App ID: \${appId}\`);
      }

      const accountName = tokenData.account_name;
      console.log(\`✅ Account name retrieved: \${accountName}\`);
      return accountName;
      
    } catch (error) {
      console.error(\`🚨 Failed to get account name for App ID \${appId}:\`, error.message);
      throw error;
    }
  }

  // Additional methods: saveUserAccessToken, getTokenByAppId, etc.
  // (See full implementation for complete methods)
}

export default UserAccessToken_AuthorizationCodeManager;
```

---