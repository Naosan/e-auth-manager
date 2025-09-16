// UserAccessToken_AuthorizationCodeManager.js - SQLite Database-based eBay User Access Token Management (authorization_code grant)
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import axios from 'axios';
import LocalSharedTokenManager from './LocalSharedTokenManager.js';
import FileJsonTokenProvider from './providers/FileJsonTokenProvider.js';

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
    this.customMasterKeyProvided = options.customMasterKeyProvided ?? Boolean(options.masterKey);
    this.masterKey = options.masterKey || os.hostname();

    // Default App ID for database searches (prioritized over clientId)
    this.defaultAppId = options.defaultAppId || this.clientId;

    // Initial Refresh Token for first-time setup
    this.initialRefreshToken = options.initialRefreshToken;

    // Database connection (lazy initialization)
    this.db = null;

    // In-memory cache for performance
    this.memoryCache = new Map();
    this.cacheExpiration = new Map();

    // Track reset operations to avoid recursive purges
    this._isResettingTokens = false;
    this._skipNextResetDueToFingerprint = false;
    
    // Encryption key for token storage
    if (this.encryptionEnabled) {
      this.encryptionKey = this.deriveEncryptionKey();
      this.encryptionFingerprint = this.computeEncryptionFingerprint();
    } else {
      this.encryptionKey = null;
      this.encryptionFingerprint = null;
    }

    // Always initialize LocalSharedTokenManager for dual storage (no environment variable needed)
    // This provides fast JSON access and automatic backup
    try {
      this.fileTokenManager = this.encryptionEnabled
        ? new LocalSharedTokenManager({
          masterKey: this.masterKey,
          tokenFilePath: options.tokenFilePath
        })
        : null;
      if (this.fileTokenManager) {
        console.log('🔄 Dual storage enabled automatically: Database + Encrypted JSON file');
      }
    } catch (error) {
      console.warn('⚠️ Could not initialize file token manager, using database only:', error.message);
      this.fileTokenManager = null;
    }

    // Centralized JSON (SSOT) Provider (enabled if specified)
    this.tokenProvider = options.tokenProvider || (
      options.ssotJsonPath && this.customMasterKeyProvided
        ? new FileJsonTokenProvider({
          filePath: options.ssotJsonPath,
          masterKey: this.masterKey,
          namespace: options.tokenNamespace || 'ebay-oauth'
        })
        : null
    );
    
    if (this.tokenProvider) {
      console.log('🌟 Centralized token provider (SSOT) enabled for multi-package coordination');
    }
    
    // Auto-initialize refresh token if provided
    if (this.initialRefreshToken) {
      this.initializeRefreshToken();
    }
  }

  /**
   * Set refresh token for first-time setup
   * @param {string} refreshToken - The refresh token obtained from manual OAuth flow
   * @param {string} accountName - Account name to associate with the token (default: 'default')
   * @param {string} appId - App ID to associate with the token (default: this.defaultAppId)
   */
  async setRefreshToken(refreshToken, accountName = 'default', appId = null) {
    try {
      console.log(`🔑 Setting initial refresh token for account: ${accountName}`);
      
      if (!refreshToken) {
        throw new Error('Refresh token is required');
      }

      const now = new Date().toISOString();
      const actualAppId = appId || this.defaultAppId;
      
      // Create minimal token data with expired access token to force immediate refresh
      const tokenData = {
        accessToken: 'initial_placeholder_token',
        refreshToken: refreshToken,
        accessTokenUpdatedDate: '1970-01-01T00:00:00.000Z', // Force expiration
        refreshTokenUpdatedDate: now,
        expiresIn: 1, // 1 second - forces immediate refresh
        refreshTokenExpiresIn: 47304000, // 1.5 years default
        tokenType: 'Bearer',
        appId: actualAppId
      };

      await this.saveUserAccessToken(accountName, tokenData);
      if (this.tokenProvider) {
        await this.tokenProvider.set(actualAppId, refreshToken, 1);
      }
      console.log(`✅ Initial refresh token set successfully for ${accountName} (App ID: ${actualAppId})`);
      console.log('💡 Access token will be automatically obtained on first use');
      
    } catch (error) {
      console.error('🚨 Failed to set refresh token:', error.message);
      throw error;
    }
  }

  /**
   * Initialize refresh token from constructor options (called automatically)
   */
  async initializeRefreshToken() {
    try {
      if (!this.initialRefreshToken) {
        return;
      }
      
      console.log('🚀 Auto-initializing refresh token from environment...');
      await this.setRefreshToken(this.initialRefreshToken, 'default', this.defaultAppId);
      
    } catch (error) {
      console.error('🚨 Failed to auto-initialize refresh token:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
      console.info('🛠️ Recommended actions:');
      console.info('   • Ensure required environment variables (e.g., EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_INITIAL_REFRESH_TOKEN) are set.');
      console.info('   • Verify that EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY matches the key used to encrypt existing tokens.');
      console.info('   • Confirm the database path is writable and the master key is correct.');
      console.warn('⚠️ Database has NOT been initialized. Refresh token was not stored.');
      // Don't throw error - this is a convenience feature, not critical
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
      await this.initializeDatabase(this.db);
    }
    return this.db;
  }

  /**
   * Initialize database schema
   */
  async initializeDatabase(db = this.db) {
    if (!db) {
      throw new Error('Database connection is not initialized');
    }
    await db.exec(`
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
    `);
    
    // Create index for app_id lookups
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ebay_oauth_tokens_app_id
      ON ebay_oauth_tokens(app_id)
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    if (this.encryptionEnabled) {
      await this.ensureEncryptionFingerprint(db);
    }
  }

  async ensureEncryptionFingerprint(db) {
    const fingerprint = this.encryptionFingerprint || this.computeEncryptionFingerprint();
    if (!fingerprint) {
      return;
    }

    const existing = await db.get(`
      SELECT value FROM oauth_metadata
      WHERE key = ?
    `, ['encryption_fingerprint']);

    if (!existing) {
      await this.storeEncryptionFingerprint(db, fingerprint);
      return;
    }

    if (existing.value !== fingerprint) {
      console.warn('⚠️ Encryption key fingerprint changed. Purging stored tokens...');
      await this.resetAllTokens({ db, skipFingerprintUpdate: true, force: true });
      this._skipNextResetDueToFingerprint = true;
      await this.storeEncryptionFingerprint(db, fingerprint);
    }
  }

  async storeEncryptionFingerprint(db, fingerprint) {
    await db.run(`
      INSERT INTO oauth_metadata (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `, ['encryption_fingerprint', fingerprint]);
  }

  computeEncryptionFingerprint() {
    if (!this.encryptionEnabled || !this.encryptionKey) {
      return null;
    }
    return crypto.createHash('sha256').update(this.encryptionKey).digest('hex');
  }

  async resetAllTokens({ db: providedDb = null, skipFingerprintUpdate = false, force = false } = {}) {
    if (!force && this._skipNextResetDueToFingerprint) {
      this._skipNextResetDueToFingerprint = false;
      return;
    }

    if (!force && this._isResettingTokens) {
      return;
    }

    let releaseGuard = false;
    if (!force && !this._isResettingTokens) {
      this._isResettingTokens = true;
      releaseGuard = true;
    }

    try {
      const db = providedDb || await this.getDb();

      if (!force && this._skipNextResetDueToFingerprint) {
        this._skipNextResetDueToFingerprint = false;
        return;
      }
      const deleteResult = await db.run('DELETE FROM ebay_oauth_tokens');
      const removedRows = deleteResult?.changes ?? 0;

      this.memoryCache.clear();
      this.cacheExpiration.clear();

      if (this.fileTokenManager && typeof this.fileTokenManager.clearStorage === 'function') {
        try {
          await this.fileTokenManager.clearStorage();
        } catch (fileError) {
          console.warn('⚠️ Failed to remove encrypted token file:', fileError.message);
        }
      }

      if (!skipFingerprintUpdate && this.encryptionEnabled) {
        const fingerprint = this.encryptionFingerprint || this.computeEncryptionFingerprint();
        if (fingerprint) {
          await this.storeEncryptionFingerprint(db, fingerprint);
        }
      }

      console.warn(`⚠️ Existing tokens were purged (${removedRows} database record(s) deleted) because the encryption key fingerprint changed.`);
    } catch (error) {
      console.error('🚨 Failed to reset stored tokens:', error.message);
      throw error;
    } finally {
      if (releaseGuard) {
        this._isResettingTokens = false;
      }
    }
  }

  /**
   * Get valid access token by App ID (preferred method)
   * Priority: Memory Cache → JSON File → Database → Refresh from eBay
   */
  async getUserAccessTokenByAppId(appId) {
    try {
      console.log(`🔍 Checking token for App ID: ${appId}`);
      
      // 1. Check memory cache first (fastest)
      const cacheKey = `token_appid_${appId}`;
      if (this.memoryCache.has(cacheKey)) {
        const cachedToken = this.memoryCache.get(cacheKey);
        const expiration = this.cacheExpiration.get(cacheKey);
        
        if (Date.now() < expiration) {
          console.log(`✅ Using cached token for App ID ${appId}`);
          return cachedToken;
        } else {
          // Remove expired cache
          this.memoryCache.delete(cacheKey);
          this.cacheExpiration.delete(cacheKey);
          console.log(`🗑️ Removed expired cache for App ID ${appId}`);
        }
      }

      // 2. Check JSON file second (fast)
      if (this.fileTokenManager) {
        try {
          const jsonToken = await this.fileTokenManager.getToken(appId);
          if (jsonToken && jsonToken.accessToken) {
            // Check if access token is not expired (2 hours = 7200 seconds)
            const tokenAge = Date.now() - new Date(jsonToken.accessTokenUpdatedDate).getTime();
            const expiresIn = (jsonToken.expiresIn || 7200) * 1000; // Convert to milliseconds
            
            if (tokenAge < expiresIn - 300000) { // 5 minutes buffer
              console.log(`📁 Using token from JSON file for App ID ${appId}`);
              
              // Cache in memory for next time
              this.updateMemoryCache(cacheKey, jsonToken.accessToken, (expiresIn - tokenAge) / 1000);
              
              return jsonToken.accessToken;
            } else {
              console.log(`⏰ JSON file token expired for App ID ${appId}, will refresh`);
            }
          }
        } catch (fileError) {
          console.log(`📁 Could not read from JSON file: ${fileError.message}`);
        }
      }

      // 3. Get token from database third
      console.log(`🗄️ Getting token from database for App ID: ${appId}`);
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        // Fallback: Try to get by default account name if App ID matches
        if (appId === this.clientId) {
          console.log('🔄 App ID matches client ID, trying default account fallback...');
          return await this.getUserAccessToken('default');
        }
        throw new Error(`No token found for App ID: ${appId}`);
      }

      // Check if access token is expired
      if (this.isAccessTokenExpired(tokenData)) {
        console.log(`⚠️ Access token expired for App ID ${appId}, refreshing via eBay API...`);
        await this.renewUserAccessTokenByAppId(appId, tokenData);
        // Get updated token data
        const refreshedTokenData = await this.getTokenByAppId(appId);
        if (refreshedTokenData) {
          const decryptedToken = this.decryptToken(refreshedTokenData.access_token);
          this.updateMemoryCache(cacheKey, decryptedToken, refreshedTokenData.expires_in);
          return decryptedToken;
        }
      } else {
        const decryptedToken = this.decryptToken(tokenData.access_token);
        this.updateMemoryCache(cacheKey, decryptedToken, tokenData.expires_in);
        return decryptedToken;
      }
    } catch (error) {
      console.error(`🚨 Failed to get valid access token for App ID ${appId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get valid access token (App ID優先、account nameはフォールバック)
   */
  async getUserAccessToken(accountName = 'default') {
    try {
      // If account name is 'default', try Default App ID first
      if (accountName === 'default' && this.defaultAppId) {
        try {
          return await this.getUserAccessTokenByAppId(this.defaultAppId);
        } catch (error) {
          console.log(`⚠️ Failed to get token by Default App ID ${this.defaultAppId}, falling back to account name...`);
        }
      }

      console.log(`🔑 Getting token for account name: ${accountName}`);
      
      // Check memory cache first
      const cacheKey = `token_${accountName}`;
      if (this.memoryCache.has(cacheKey)) {
        const cachedToken = this.memoryCache.get(cacheKey);
        const expiration = this.cacheExpiration.get(cacheKey);
        
        if (Date.now() < expiration) {
          console.log(`✅ Using cached token for ${accountName}`);
          return cachedToken;
        } else {
          // Remove expired cache
          this.memoryCache.delete(cacheKey);
          this.cacheExpiration.delete(cacheKey);
        }
      }

      // Get token from database
      const tokenData = await this.getTokenFromDatabase(accountName);
      
      if (!tokenData) {
        throw new Error(`No token found for account: ${accountName}`);
      }

      // Check if access token is expired
      if (this.isAccessTokenExpired(tokenData)) {
        console.log(`⚠️ Access token expired for ${accountName}, refreshing...`);
        await this.renewUserAccessToken(accountName, tokenData);
        // Get updated token data
        const refreshedTokenData = await this.getTokenFromDatabase(accountName);
        if (refreshedTokenData) {
          const decryptedToken = this.decryptToken(refreshedTokenData.access_token);
          this.updateMemoryCache(`token_${accountName}`, decryptedToken, refreshedTokenData.expires_in);
          return decryptedToken;
        }
      } else {
        const decryptedToken = this.decryptToken(tokenData.access_token);
        this.updateMemoryCache(`token_${accountName}`, decryptedToken, tokenData.expires_in);
        return decryptedToken;
      }
    } catch (error) {
      console.error(`🚨 Failed to get valid access token for ${accountName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get token data from database by App ID (preferred method)
   */
  async getTokenByAppId(appId) {
    const db = await this.getDb();
    const tokenRow = await db.get(`
      SELECT * FROM ebay_oauth_tokens 
      WHERE app_id = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `, [appId]);

    if (!tokenRow) {
      console.warn(`⚠️ No token found in database for app ID: ${appId}`);
      return null;
    }

    console.log(`📊 Found token for app ID ${appId} (${tokenRow.account_name}), last updated: ${tokenRow.updated_at}`);
    return tokenRow;
  }

  /**
   * Get token data from database (App ID優先、account nameはフォールバック)
   */
  async getTokenFromDatabase(accountName) {
    const db = await this.getDb();
    
    // If accountName is 'default', try Default App ID first
    if (accountName === 'default' && this.defaultAppId) {
      try {
        const tokenByAppId = await this.getTokenByAppId(this.defaultAppId);
        if (tokenByAppId) {
          return tokenByAppId;
        }
        console.warn(`⚠️ No token found for Default App ID ${this.defaultAppId}, trying account name fallback...`);
      } catch (error) {
        console.warn(`⚠️ Failed to get token by Default App ID: ${error.message}`);
      }
    }

    // Fallback to account name search
    const tokenRow = await db.get(`
      SELECT * FROM ebay_oauth_tokens 
      WHERE account_name = ? 
      ORDER BY updated_at DESC 
      LIMIT 1
    `, [accountName]);

    if (!tokenRow) {
      console.warn(`⚠️ No token found in database for account: ${accountName}`);
      return null;
    }

    console.log(`📊 Found token for ${accountName}, last updated: ${tokenRow.updated_at}`);
    return tokenRow;
  }

  /**
   * Save token data to database
   */
  async saveUserAccessToken(accountName, tokenData) {
    const db = await this.getDb();
    
    try {
      // Encrypt sensitive token data
      const encryptedAccessToken = this.encryptToken(tokenData.accessToken);
      const encryptedRefreshToken = this.encryptToken(tokenData.refreshToken);
      
      const now = new Date().toISOString();
      const appId = tokenData.appId || this.defaultAppId;
      const accessTokenUpdatedDate = tokenData.accessTokenUpdatedDate || now;
      const refreshTokenUpdatedDate = tokenData.refreshTokenUpdatedDate || now;
      const refreshTokenExpiresIn = tokenData.refreshTokenExpiresIn || 47304000; // Default 1.5 years
      const tokenType = tokenData.tokenType || 'Bearer';

      const result = await db.run(`
        INSERT INTO ebay_oauth_tokens
        (name, account_name, app_id, access_token, refresh_token,
         access_token_updated_date, expires_in, refresh_token_updated_date,
         refresh_token_expires_in, token_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_name) DO UPDATE SET
          app_id = excluded.app_id,
          access_token = excluded.access_token,
          refresh_token = excluded.refresh_token,
          access_token_updated_date = excluded.access_token_updated_date,
          expires_in = excluded.expires_in,
          refresh_token_updated_date = excluded.refresh_token_updated_date,
          refresh_token_expires_in = excluded.refresh_token_expires_in,
          token_type = excluded.token_type,
          updated_at = excluded.updated_at
      `, [
        'oauth',
        accountName,
        appId,
        encryptedAccessToken,
        encryptedRefreshToken,
        accessTokenUpdatedDate,
        tokenData.expiresIn,
        refreshTokenUpdatedDate,
        refreshTokenExpiresIn,
        tokenType,
        now,
        now
      ]);

      if (result?.changes > 0) {
        console.log(`✅ Stored token for account: ${accountName} (App ID: ${appId})`);
      } else {
        console.log(`ℹ️ Token record unchanged for account: ${accountName}`);
      }

      // Clear memory cache to force refresh
      const cacheKey = `token_${accountName}`;
      this.memoryCache.delete(cacheKey);
      this.cacheExpiration.delete(cacheKey);

      // Automatic dual storage: Also save to encrypted JSON file
      if (this.fileTokenManager) {
        try {
          const appId = tokenData.appId || this.defaultAppId;
          await this.fileTokenManager.saveToken(appId, {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresIn: tokenData.expiresIn || 7200,
            refreshTokenExpiresIn: tokenData.refreshTokenExpiresIn || 47304000,
            accessTokenUpdatedDate: tokenData.accessTokenUpdatedDate || now,
            refreshTokenUpdatedDate: tokenData.refreshTokenUpdatedDate || now
          });
          console.log(`🔄 Auto-saved to encrypted JSON for app: ${appId}`);
        } catch (fileError) {
          console.warn('⚠️ Could not save to JSON file:', fileError.message);
          // Don't throw error - database save succeeded, file save is secondary
        }
      }
    } catch (error) {
      console.error(`🚨 Failed to save token for ${accountName}:`, error.message);
      throw error;
    }
  }

  /**
   * Refresh access token by App ID (preferred method)
   */
  async renewUserAccessTokenByAppId(appId, tokenData, options = {}) {
    try {
      console.log(`🔄 Refreshing access token for App ID: ${appId}`);

      // 1) Get latest refresh token from centralized provider (SSOT) if available
      let rtRecord = null;
      if (this.tokenProvider) {
        rtRecord = await this.tokenProvider.get(appId);
      }
      const refreshToken = rtRecord?.refreshToken || this.decryptToken(tokenData.refresh_token);

      // Prepare OAuth request function
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const now = new Date().toISOString();

      const doRefresh = async (rt) => {
        let requestBody = `grant_type=refresh_token&refresh_token=${encodeURIComponent(rt)}`;
        
        // Add scope if provided
        if (options.scope) {
          requestBody += `&scope=${encodeURIComponent(options.scope)}`;
        }

        return await axios.post(
          this.tokenUrl,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${auth}`,
            }
          }
        );
      };

      let data;
      if (this.tokenProvider) {
        // Use centralized provider with distributed locking
        data = await this.tokenProvider.withLock(appId, async () => {
          const latest = await this.tokenProvider.get(appId);
          const rtToUse = latest?.refreshToken || refreshToken;
          const res = await doRefresh(rtToUse);
          const body = res.data;
          
          // eBay returns new refresh_token only sometimes - increment version when it does
          const newRT = body.refresh_token || rtToUse;
          const newVersion = (latest?.version ?? rtRecord?.version ?? 0) + (body.refresh_token ? 1 : 0);
          await this.tokenProvider.set(appId, newRT, newVersion);
          return body;
        });
      } else {
        // Legacy mode - direct refresh without provider
        data = (await doRefresh(refreshToken)).data;
      }

      // Update token data in database by account name (since saveUserAccessToken uses account_name)
      await this.saveUserAccessToken(tokenData.account_name, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        accessTokenUpdatedDate: now,
        refreshTokenUpdatedDate: data.refresh_token ? now : tokenData.refresh_token_updated_date,
        expiresIn: data.expires_in,
        refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
        tokenType: data.token_type || 'Bearer',
        appId: appId
      });

      console.log(`✅ Access token refreshed successfully for App ID ${appId} (${tokenData.account_name})`);
      
      // Clear related caches
      this.memoryCache.delete(`token_appid_${appId}`);
      this.cacheExpiration.delete(`token_appid_${appId}`);
      this.memoryCache.delete(`token_${tokenData.account_name}`);
      this.cacheExpiration.delete(`token_${tokenData.account_name}`);
      
      // 次回呼び出しを速くするため即キャッシュ
      this.updateMemoryCache(`token_appid_${appId}`, data.access_token, data.expires_in);
      
      return data;
    } catch (error) {
      // Handle invalid_grant with automatic recovery using centralized provider
      if (this.tokenProvider && error.response?.data?.error === 'invalid_grant') {
        console.warn(`⚠️ Invalid grant detected for App ID ${appId}, attempting recovery from SSOT...`);
        
        // Clear local caches to force fresh reads
        this.memoryCache.delete(`token_appid_${appId}`);
        this.cacheExpiration.delete(`token_appid_${appId}`);
        
        try {
          const latest = await this.tokenProvider.get(appId);
          if (latest?.refreshToken) {
            console.log(`🔄 Retrying refresh with latest token from SSOT (version: ${latest.version})`);
            
            const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
            let requestBody = `grant_type=refresh_token&refresh_token=${encodeURIComponent(latest.refreshToken)}`;
            
            if (options.scope) {
              requestBody += `&scope=${encodeURIComponent(options.scope)}`;
            }

            const response = await axios.post(
              this.tokenUrl,
              requestBody,
              {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'Authorization': `Basic ${auth}`,
                }
              }
            );

            const data = response.data;
            const now = new Date().toISOString();
            
            // Update centralized provider
            const newRT = data.refresh_token || latest.refreshToken;
            const newVersion = (latest.version ?? 0) + (data.refresh_token ? 1 : 0);
            await this.tokenProvider.set(appId, newRT, newVersion);

            // Update local database
            await this.saveUserAccessToken(tokenData.account_name, {
              accessToken: data.access_token,
              refreshToken: newRT,
              accessTokenUpdatedDate: now,
              refreshTokenUpdatedDate: data.refresh_token ? now : tokenData.refresh_token_updated_date,
              expiresIn: data.expires_in,
              refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
              tokenType: data.token_type || 'Bearer',
              appId: appId
            });

            console.log(`✅ Successfully recovered from invalid_grant for App ID ${appId}`);
            this.updateMemoryCache(`token_appid_${appId}`, data.access_token, data.expires_in);
            return data;
          }
        } catch (recoveryError) {
          console.error(`🚨 Failed to recover from invalid_grant: ${recoveryError.message}`);
          throw new Error(`eBay token refresh failed after SSOT recovery attempt: ${recoveryError.response?.data?.error_description || recoveryError.message}`);
        }
      }

      console.error(`🚨 Failed to refresh access token for App ID ${appId}:`, error.message);
      if (error.response?.data) {
        console.error('eBay API error response:', error.response.data);
      }
      throw new Error(`eBay token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token using refresh token (legacy compatibility)
   */
  async renewUserAccessToken(accountName, tokenData, options = {}) {
    try {
      console.log(`🔄 Refreshing access token for account: ${accountName}`);

      // Decrypt refresh token
      const refreshToken = this.decryptToken(tokenData.refresh_token);

      // Prepare OAuth request
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      const now = new Date().toISOString();

      let requestBody = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
      
      // Add scope if provided
      if (options.scope) {
        requestBody += `&scope=${encodeURIComponent(options.scope)}`;
      }

      const response = await axios.post(
        this.tokenUrl,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`,
          }
        }
      );

      const data = response.data;

      // Update token data in database
      await this.saveUserAccessToken(accountName, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided
        accessTokenUpdatedDate: now,
        refreshTokenUpdatedDate: data.refresh_token ? now : tokenData.refresh_token_updated_date,
        expiresIn: data.expires_in,
        refreshTokenExpiresIn: tokenData.refresh_token_expires_in,
        tokenType: data.token_type || 'Bearer'
      });

      console.log(`✅ Access token refreshed successfully for ${accountName}`);
      
      // Clear related caches
      this.memoryCache.delete(`token_${accountName}`);
      this.cacheExpiration.delete(`token_${accountName}`);
      
      return data;
    } catch (error) {
      console.error(`🚨 Failed to refresh access token for ${accountName}:`, error.message);
      if (error.response?.data) {
        console.error('eBay API error response:', error.response.data);
      }
      throw new Error(`eBay token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Check if access token is expired
   */
  isAccessTokenExpired(tokenData, bufferSeconds = 300) {
    if (!tokenData.access_token_updated_date || !tokenData.expires_in) {
      return true;
    }

    const updatedTime = new Date(tokenData.access_token_updated_date).getTime();
    const expirationTime = updatedTime + (tokenData.expires_in * 1000);
    const currentTime = Date.now();
    
    return currentTime > (expirationTime - bufferSeconds * 1000);
  }

  /**
   * Check if refresh token is expired
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
   * Update memory cache
   */
  updateMemoryCache(cacheKey, token, expiresIn) {
    if (!token || !expiresIn) {
      return;
    }
    // 実効期限の60秒前に失効扱い（従来挙動は維持しつつ安全側）
    const ttl = Math.max(0, (expiresIn - 60) * 1000);
    this.memoryCache.set(cacheKey, token);
    this.cacheExpiration.set(cacheKey, Date.now() + ttl);
  }

  /**
   * Derive encryption key for token storage
   */
  deriveEncryptionKey() {
    try {
      const masterKey = this.masterKey;
      const machineId = process.env.COMPUTERNAME || process.env.HOSTNAME || 'default-machine';
      
      return crypto.scryptSync(
        masterKey + machineId,
        'ebay-database-tokens-salt-v1',
        32
      );
    } catch (error) {
      console.error('🚨 Failed to derive encryption key:', error.message);
      throw error;
    }
  }

  /**
   * Encrypt token data
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
      return `aes-256-gcm:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
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
      const authTag = Buffer.from(authTagBase64, 'base64');
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
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
   * Check refresh token validity (required for GetMySellerList compatibility)
   * @returns {Promise<boolean>} - true if refresh token is valid, false if expired
   */
  async checkRefreshTokenValidity() {
    try {
      console.log('🔍 Checking refresh token validity...');
      
      // Try to get the most recent token data using Default App ID first
      let tokenData = null;
      
      // Try Default App ID first
      if (this.defaultAppId) {
        tokenData = await this.getTokenByAppId(this.defaultAppId);
      }

      // Fallback to default account name
      if (!tokenData) {
        tokenData = await this.getTokenFromDatabase('default');
      }

      if (!tokenData) {
        console.warn('⚠️ No token found in database');
        return false;
      }

      // Check if refresh token is expired
      const isExpired = this.isRefreshTokenExpired(tokenData);
      
      if (isExpired) {
        console.error('❌ Refresh token is expired');
        return false;
      } else {
        console.log('✅ Refresh token is valid');
        return true;
      }
    } catch (error) {
      console.error('🚨 Failed to check refresh token validity:', error.message);
      return false;
    }
  }

  /**
   * Get comprehensive User Access Token information including metadata
   * @param {string} appId - The eBay App ID to get token info for
   * @returns {Promise<Object>} User token information object
   */
  async getUserTokenInfo(appId) {
    try {
      console.log(`🔍 Getting token info for App ID: ${appId}`);
      
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        throw new Error(`No token found for App ID: ${appId}`);
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

      console.log(`✅ Token info retrieved for account: ${tokenData.account_name}`);
      return tokenInfo;
      
    } catch (error) {
      console.error(`🚨 Failed to get token info for App ID ${appId}:`, error.message);
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
      console.log(`⏰ Getting token expiration info for App ID: ${appId}`);
      
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        throw new Error(`No token found for App ID: ${appId}`);
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

      console.log(`✅ Token expiration info: ${expiresIn}s remaining (${percentageRemaining.toFixed(1)}%)`);
      return expirationInfo;
      
    } catch (error) {
      console.error(`🚨 Failed to get token expiration for App ID ${appId}:`, error.message);
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
      console.log(`👤 Getting account name for App ID: ${appId}`);
      
      const tokenData = await this.getTokenByAppId(appId);
      
      if (!tokenData) {
        throw new Error(`No token found for App ID: ${appId}`);
      }

      const accountName = tokenData.account_name;
      console.log(`✅ Account name retrieved: ${accountName}`);
      return accountName;
      
    } catch (error) {
      console.error(`🚨 Failed to get account name for App ID ${appId}:`, error.message);
      throw error;
    }
  }
}

export default UserAccessToken_AuthorizationCodeManager;
