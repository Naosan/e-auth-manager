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
    defaultAppId: options.defaultAppId || process.env.EBAY_DEFAULT_APP_ID,
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