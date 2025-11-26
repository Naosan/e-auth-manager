// Configuration management for eBay OAuth Token Manager
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from consumer project (cwd) first, then fall back to package root without overriding.
dotenv.config();
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

/**
 * Load configuration from environment variables and config files
 * @param {Object} options - Override options
 * @returns {Object} Configuration object
 */
export function loadConfig(options = {}) {
  const clientId = options.clientId ||
    process.env.EAUTH_EBAY_CLIENT_ID ||
    process.env.EAUTH_CLIENT_ID ||
    process.env.EBAY_CLIENT_ID ||
    process.env.EBAY_API_APP_NAME;

  const clientSecret = options.clientSecret ||
    process.env.EAUTH_EBAY_CLIENT_SECRET ||
    process.env.EAUTH_CLIENT_SECRET ||
    process.env.EBAY_CLIENT_SECRET ||
    process.env.EBAY_API_CERT_NAME;

  if (!clientId || !clientSecret) {
    const missing = [];
    if (!clientId) {
      missing.push('EAUTH_CLIENT_ID (or EBAY_CLIENT_ID / EBAY_API_APP_NAME)');
    }
    if (!clientSecret) {
      missing.push('EAUTH_CLIENT_SECRET (or EBAY_CLIENT_SECRET / EBAY_API_CERT_NAME)');
    }
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\nPlease set these variables or pass them as options.`);
  }

  const providedMasterKey = options.masterKey ||
    process.env.EAUTH_MASTER_KEY ||
    process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY;

  const config = {
    // eBay API Credentials (REQUIRED)
    clientId,
    clientSecret,

    // Optional configuration
    defaultAppId: options.defaultAppId || process.env.EAUTH_DEFAULT_APP_ID || process.env.EBAY_DEFAULT_APP_ID || clientId,
    environment: options.environment || process.env.EAUTH_ENVIRONMENT || process.env.EBAY_ENVIRONMENT || 'PRODUCTION',
    
    // Database configuration
    databasePath: options.databasePath || process.env.EAUTH_DATABASE_PATH || process.env.EBAY_DATABASE_PATH || './database/ebay_tokens.sqlite',
    
    // File-based token storage configuration
    tokenFilePath: options.tokenFilePath || process.env.EAUTH_TOKEN_FILE_PATH || process.env.EBAY_TOKEN_FILE_PATH,

    // Encryption configuration
    encryptionEnabled: options.encryptionEnabled ?? true,
    masterKey: options.masterKey || process.env.EAUTH_MASTER_KEY || process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY || os.hostname(),
    customMasterKeyProvided: Boolean(providedMasterKey),

    // API URLs (usually don't need to change)
    tokenUrl: options.tokenUrl || (
      (options.environment || process.env.EAUTH_ENVIRONMENT || process.env.EBAY_ENVIRONMENT || 'PRODUCTION')
        .toUpperCase() === 'SANDBOX'
        ? process.env.EAUTH_TOKEN_URL || process.env.EBAY_TOKEN_URL || 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
        : process.env.EAUTH_TOKEN_URL || process.env.EBAY_TOKEN_URL || 'https://api.ebay.com/identity/v1/oauth2/token'
    ),
    scope: options.scope || process.env.EAUTH_SCOPE || process.env.EBAY_SCOPE || 'https://api.ebay.com/oauth/api_scope',
    
    // Initial Refresh Token for first-time setup
    initialRefreshToken: options.initialRefreshToken || process.env.EAUTH_INITIAL_REFRESH_TOKEN || process.env.EBAY_INITIAL_REFRESH_TOKEN,
    
    // Centralized JSON (SSOT) configuration
    ssotJsonPath: options.ssotJsonPath || process.env.EAUTH_SSOT_JSON || process.env.OAUTH_SSOT_JSON,
    tokenNamespace: options.tokenNamespace || process.env.EAUTH_TOKEN_NAMESPACE || process.env.TOKEN_NAMESPACE || 'ebay-oauth'
  };

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
    initialRefreshToken: 'your_manual_refresh_token_from_browser_oauth',
    encryptionEnabled: true,
    environment: 'PRODUCTION',
    // Centralized JSON (SSOT) configuration
    ssotJsonPath: '/var/secure/ebay/refresh-ssot.json',
    tokenNamespace: 'ebay-oauth'
  };
}
