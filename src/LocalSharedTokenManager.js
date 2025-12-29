// LocalSharedTokenManager.js - File-based eBay Token Management with AES-256-CBC Encryption
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import os from 'os';

const warned = new Set();
const warnOnce = (key, message) => {
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(message);
};

class LocalSharedTokenManager {
  constructor(options = {}) {
    // Token file path - configurable with migration support
    this.tokenFile = options.tokenFilePath || this.getDefaultTokenFilePath();
    this.lockFile = `${this.tokenFile}.lock`;

    // Encryption configuration (fall back to per-machine default)
    const envEauthMasterKey = process.env.EAUTH_MASTER_KEY;
    const envEbayMasterKey = process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY;
    if (envEauthMasterKey && envEbayMasterKey && String(envEauthMasterKey) !== String(envEbayMasterKey)) {
      warnOnce(
        'env-mismatch:master-key',
        '⚠️ Both EAUTH_MASTER_KEY and EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY are set but differ. Prefer EAUTH_MASTER_KEY and remove the EBAY_* alias (or keep them identical during migration).'
      );
    }
    if (!options.masterKey && !envEauthMasterKey && envEbayMasterKey) {
      warnOnce(
        'deprecated:EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY',
        '⚠️ Using deprecated env var EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY. Please migrate to EAUTH_MASTER_KEY.'
      );
    }
    const envMasterKey = envEauthMasterKey || envEbayMasterKey;
    this.masterKey = options.masterKey || envMasterKey || os.hostname();
    this.encryptionKey = this.deriveEncryptionKey();

    // Recovery behavior when the token file is unreadable (e.g., wrong key / corruption)
    // - "error" (default): do not modify the file; throw an error
    // - "backup-and-reset": rename to *.backup.* and return empty storage
    this.recoveryMode = (options.recoveryMode || process.env.EAUTH_TOKEN_FILE_RECOVERY_MODE || 'error')
      .toString()
      .trim()
      .toLowerCase();
  }

  computeKeyFingerprint() {
    return crypto.createHash('sha256').update(this.encryptionKey).digest('hex');
  }

  async executeWithLock(fn, operationName = 'operation') {
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const release = await this.acquireLock();
        try {
          return await fn();
        } finally {
          await release();
        }
      } catch (error) {
        // Retry only when lock acquisition fails
        if (error.message && error.message.includes('Failed to acquire lock')) {
          if (attempt === maxRetries - 1) {
            throw new Error(`Failed to acquire lock for ${operationName} after ${maxRetries} retries`);
          }
          continue;
        }
        throw error;
      }
    }
  }

  async getToken(appId) {
    return this.executeWithLock(async () => {
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
    }, 'getToken');
  }

  async saveToken(appId, tokenData) {
    return this.executeWithLock(async () => {
      const current = await this.readTokenFile();
      current.tokens[appId] = {
        ...tokenData,
        lastUpdated: new Date().toISOString()
      };
      await this.saveTokenFile(current);
    }, 'saveToken');
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

      const isJsonParseError = error?.name === 'SyntaxError';
      const message = error?.message || '';
      const decryptionIndicators = [
        'Unsupported state',
        'authenticate data',
        'bad decrypt',
        'wrong final block length',
        'Invalid initialization vector',
        'Key fingerprint mismatch'
      ];
      const isDecryptionError = decryptionIndicators.some(indicator => message.includes(indicator));

      if (isJsonParseError || isDecryptionError) {
        const reason = isJsonParseError ? 'invalid JSON' : 'decryption failed (wrong key or corrupted file)';
        const shouldRecover =
          this.recoveryMode === 'backup-and-reset' ||
          this.recoveryMode === 'backup_and_reset' ||
          this.recoveryMode === 'recover' ||
          this.recoveryMode === 'auto';

        if (!shouldRecover) {
          const recoveryError = new Error(
            `Token file read failed (${reason}). Refusing to modify the file in recoveryMode="${this.recoveryMode}".\n` +
              'Fix EAUTH_MASTER_KEY (or EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY), or set EAUTH_TOKEN_FILE_RECOVERY_MODE=backup-and-reset to auto-backup+reset explicitly.'
          );
          recoveryError.code = 'EAUTH_TOKEN_FILE_UNREADABLE';
          throw recoveryError;
        }

        console.warn(`⚠️ Token file read failed (${reason}); backing up and resetting (recoveryMode=${this.recoveryMode})...`);

        try {
          await fs.rename(this.tokenFile, `${this.tokenFile}.backup.${Date.now()}`);
        } catch (backupError) {
          console.warn('⚠️ Could not backup corrupted token file:', backupError.message);
        }

        return { tokens: {} };
      }

      console.error('🚨 Failed to read token file:', message);
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
      try { 
        await fs.chmod(this.tokenFile, 0o600); 
      } catch (chmodError) {
        console.debug('Chmod warning:', chmodError.message);
      }
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
        keyFingerprint: this.computeKeyFingerprint(),
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
      if (encryptedData.keyFingerprint) {
        const expected = this.computeKeyFingerprint();
        if (encryptedData.keyFingerprint !== expected) {
          throw new Error('Key fingerprint mismatch (EAUTH_MASTER_KEY may be different)');
        }
      }

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

  async acquireLock() {
    const maxAttempts = 10;
    const retryDelay = 100;
    const staleLockTimeout = 5 * 60 * 1000; // 5 minutes

    // Ensure parent directory exists before attempting to create a lock file.
    await fs.mkdir(path.dirname(this.lockFile), { recursive: true });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Check for stale lock before attempting to acquire a new one
        try {
          const stats = await fs.stat(this.lockFile);
          const age = Date.now() - stats.mtimeMs;
          if (age > staleLockTimeout) {
            console.warn(`⚠️ Removing stale lock file: ${this.lockFile}`);
            await fs.unlink(this.lockFile);
          }
        } catch (statError) {
          if (statError.code !== 'ENOENT') {
            console.warn(`⚠️ Failed to check lock file: ${statError.message}`);
          }
        }

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

    try {
      const stats = await fs.stat(this.lockFile);
      const age = Date.now() - stats.mtimeMs;
      const cause = age > staleLockTimeout
        ? 'possible abnormal termination'
        : 'another process is holding the lock';
      console.warn(`⚠️ Failed to acquire lock ${this.lockFile} (${cause})`);
    } catch (statError) {
      console.warn(`⚠️ Failed to acquire lock ${this.lockFile} (reason unknown: ${statError.message})`);
    }

    throw new Error('Failed to acquire lock after maximum attempts');
  }

  /**
   * Get default token file path with legacy migration support
   * @returns {string} Default token file path
   */
  getDefaultTokenFilePath() {
    let basePath;
    
    // Cross-platform base path determination following npm/CLI tool conventions
    if (process.platform === 'win32') {
      // Windows: Use LOCALAPPDATA for user-specific data (follows npm/yarn pattern)
      // LOCALAPPDATA avoids roaming profile sync issues in corporate environments
      basePath = process.env.LOCALAPPDATA || process.env.APPDATA || process.env.USERPROFILE || path.join('C:', 'Users', 'Default', 'AppData', 'Local');
    } else if (process.platform === 'darwin') {
      // macOS: Use Application Support directory
      basePath = path.join(process.env.HOME || '~', 'Library/Application Support');
    } else {
      // Linux/Unix: Follow XDG Base Directory specification
      basePath = process.env.XDG_DATA_HOME || path.join(process.env.HOME || '~', '.local/share');
    }
    
    // New preferred path
    const newPath = path.join(basePath, 'ebay-oauth-tokens/ebay-tokens.encrypted.json');
    
    // Legacy paths for backwards compatibility (check in priority order)
    const legacyPaths = [
      // Previous PROGRAMDATA location
      process.platform === 'win32' 
        ? path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'ebay-oauth-tokens/ebay-tokens.encrypted.json')
        : null,
      // Original EStocks location  
      path.join(basePath, 'EStocks/tokens/ebay-tokens.encrypted.json')
    ].filter(Boolean);
    
    try {
      // Check if any legacy path exists (synchronously for constructor)
      const fs = require('fs');
      for (const legacyPath of legacyPaths) {
        if (fs.existsSync(legacyPath)) {
          console.log(`🔄 Using existing legacy path: ${path.dirname(legacyPath)} (consider migrating to new location)`);
          return legacyPath;
        }
      }
    } catch (error) {
      // If check fails, use new path
    }
    
    // Use new path for fresh installations
    return newPath;
  }

  deriveEncryptionKey() {
    try {
      return crypto.scryptSync(
        this.masterKey,
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
    const skewMs = Number(process.env.EBAY_JSON_EXPIRY_SKEW_MS || 0);
    
    return Date.now() > (expirationTime - skewMs);
  }

  /**
   * Check if refresh token is expired
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
   * Check refresh token validity (required for GetMySellerList compatibility)
   * @returns {Promise<boolean>} - true if refresh token is valid, false if expired
   */
  async checkRefreshTokenValidity() {
    try {
      console.log('🔍 Checking refresh token validity (LocalSharedTokenManager)...');

      const data = await this.readTokenFile();
      
      // Check all tokens for any valid refresh token
      const tokenIds = Object.keys(data.tokens);
      if (tokenIds.length === 0) {
        console.warn('⚠️ No tokens found in file');
        return false;
      }

      // Try default first, then any other token
      const checkOrder = ['default', ...tokenIds.filter(id => id !== 'default')];
      
      for (const tokenId of checkOrder) {
        const token = data.tokens[tokenId];
        if (!token) {continue;}

        const isRefreshExpired = this.isRefreshTokenExpired(token);
        
        if (!isRefreshExpired) {
          console.log(`✅ Valid refresh token found for: ${tokenId}`);
          return true;
        }
      }

      console.error('❌ All refresh tokens are expired');
      return false;
    } catch (error) {
      console.error('🚨 Failed to check refresh token validity:', error.message);
      return false;
    }
  }

  async clearStorage() {
    const filesToDelete = [
      this.tokenFile,
      this.lockFile,
      `${this.tokenFile}.tmp`
    ];

    for (const filePath of filesToDelete) {
      if (!filePath) {
        continue;
      }
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️ Failed to remove token file artifact ${filePath}: ${error.message}`);
        }
      }
    }

    try {
      const directory = path.dirname(this.tokenFile);
      const baseName = path.basename(this.tokenFile);
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const backupPrefix = `${baseName}.backup`;

      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        if (!entry.name.startsWith(backupPrefix)) {
          continue;
        }
        const backupPath = path.join(directory, entry.name);
        try {
          await fs.unlink(backupPath);
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(`⚠️ Failed to remove backup token file ${backupPath}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('⚠️ Failed to enumerate backup token files:', error.message);
      }
    }

    console.log('🧹 Cleared encrypted JSON token storage artifacts');
  }
}

export default LocalSharedTokenManager;
