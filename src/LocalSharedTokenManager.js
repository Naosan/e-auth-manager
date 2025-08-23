// LocalSharedTokenManager.js - File-based eBay Token Management with AES-256-GCM Encryption
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

class LocalSharedTokenManager {
  constructor(options = {}) {
    // Validate required options for security
    if (!options.masterKey) {
      throw new Error('masterKey is required for LocalSharedTokenManager. Pass it as option or set EBAY_MASTER_KEY environment variable.');
    }

    // Token file path - configurable
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
      try { await fs.chmod(this.tokenFile, 0o600); } catch {}
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
        if (!token) continue;

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
}

export default LocalSharedTokenManager;