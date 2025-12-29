// Configuration management for eBay OAuth Token Manager
import dotenv from 'dotenv';
import fs from 'fs';
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
  const pick = (...values) => values.find(v => v !== undefined && v !== null && v !== '');

  // Optional config file (supports multiple values in one place)
  const configPath = pick(options.configPath, process.env.EAUTH_CONFIG, process.env.EAUTH_CONFIG_FILE);
  let fileConfig = {};
  if (configPath) {
    try {
      const resolved = path.resolve(configPath);
      const raw = fs.readFileSync(resolved, 'utf8');
      fileConfig = JSON.parse(raw) || {};
    } catch (error) {
      console.warn(`⚠️ Could not load config file at ${configPath}: ${error.message}`);
    }
  }

  const clientId = pick(
    options.clientId,
    fileConfig.clientId,
    process.env.EAUTH_EBAY_CLIENT_ID,
    process.env.EAUTH_CLIENT_ID,
    process.env.EBAY_CLIENT_ID,
    process.env.EBAY_API_APP_NAME
  );

  const clientSecret = pick(
    options.clientSecret,
    fileConfig.clientSecret,
    process.env.EAUTH_EBAY_CLIENT_SECRET,
    process.env.EAUTH_CLIENT_SECRET,
    process.env.EBAY_CLIENT_SECRET,
    process.env.EBAY_API_CERT_NAME
  );

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

  const providedMasterKey = pick(
    options.masterKey,
    fileConfig.masterKey,
    process.env.EAUTH_MASTER_KEY ||
    process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY
  );

  const config = {
    // eBay API Credentials (REQUIRED)
    clientId,
    clientSecret,

    // Optional configuration
    defaultAppId: pick(options.defaultAppId, fileConfig.defaultAppId, process.env.EAUTH_DEFAULT_APP_ID, process.env.EBAY_DEFAULT_APP_ID, clientId),
    defaultAccountName: pick(
      options.defaultAccountName,
      options.accountName,
      fileConfig.defaultAccountName,
      fileConfig.accountName,
      process.env.EAUTH_ACCOUNT_NAME,
      process.env.EBAY_ACCOUNT_NAME,
      'default'
    ),
    environment: pick(options.environment, fileConfig.environment, process.env.EAUTH_ENVIRONMENT, process.env.EBAY_ENVIRONMENT, 'PRODUCTION'),
    
    // Database configuration
    databasePath: pick(options.databasePath, fileConfig.databasePath, process.env.EAUTH_DATABASE_PATH, process.env.EBAY_DATABASE_PATH, './database/ebay_tokens.sqlite'),
    
    // File-based token storage configuration
    tokenFilePath: pick(options.tokenFilePath, fileConfig.tokenFilePath, process.env.EAUTH_TOKEN_FILE_PATH, process.env.EBAY_TOKEN_FILE_PATH),

    // Encryption configuration
    encryptionEnabled: options.encryptionEnabled ?? true,
    masterKey: pick(options.masterKey, fileConfig.masterKey, process.env.EAUTH_MASTER_KEY, process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY, os.hostname()),
    customMasterKeyProvided: Boolean(providedMasterKey),

    // API URLs (usually don't need to change)
    tokenUrl: options.tokenUrl || (
      (options.environment || fileConfig.environment || process.env.EAUTH_ENVIRONMENT || process.env.EBAY_ENVIRONMENT || 'PRODUCTION')
        .toUpperCase() === 'SANDBOX'
        ? pick(fileConfig.tokenUrl, process.env.EAUTH_TOKEN_URL, process.env.EBAY_TOKEN_URL, 'https://api.sandbox.ebay.com/identity/v1/oauth2/token')
        : pick(fileConfig.tokenUrl, process.env.EAUTH_TOKEN_URL, process.env.EBAY_TOKEN_URL, 'https://api.ebay.com/identity/v1/oauth2/token')
    ),
    scope: pick(options.scope, fileConfig.scope, process.env.EAUTH_SCOPE, process.env.EBAY_SCOPE, 'https://api.ebay.com/oauth/api_scope'),
    
    // Initial Refresh Token for first-time setup
    initialRefreshToken: pick(options.initialRefreshToken, fileConfig.initialRefreshToken, process.env.EAUTH_INITIAL_REFRESH_TOKEN, process.env.EBAY_INITIAL_REFRESH_TOKEN),
    initialRefreshTokenMode: pick(
      options.initialRefreshTokenMode,
      fileConfig.initialRefreshTokenMode,
      process.env.EAUTH_INITIAL_REFRESH_TOKEN_MODE
    ),
    
    // Centralized JSON (SSOT) configuration
    ssotJsonPath: pick(options.ssotJsonPath, fileConfig.ssotJsonPath, process.env.EAUTH_SSOT_JSON, process.env.OAUTH_SSOT_JSON),
    tokenNamespace: pick(options.tokenNamespace, fileConfig.tokenNamespace, process.env.EAUTH_TOKEN_NAMESPACE, process.env.TOKEN_NAMESPACE, 'ebay-oauth')
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
