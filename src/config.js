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

const warned = new Set();
const warnOnce = (key, message) => {
  if (warned.has(key)) {
    return;
  }
  warned.add(key);
  console.warn(message);
};

/**
 * Load configuration from environment variables and config files
 * @param {Object} options - Override options
 * @returns {Object} Configuration object
 */
export function loadConfig(options = {}) {
  const pick = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
  const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

  const expandHome = (value) => {
    if (!hasValue(value)) {
      return value;
    }
    const text = String(value).trim();
    if (text === '~') {
      return os.homedir();
    }
    if (text.startsWith('~/') || text.startsWith('~\\')) {
      return path.join(os.homedir(), text.slice(2));
    }
    return text;
  };

  const resolveFsPath = (value) => {
    if (!hasValue(value)) {
      return value;
    }
    const expanded = expandHome(value);
    if (expanded === ':memory:') {
      return expanded;
    }
    return path.isAbsolute(expanded) ? expanded : path.resolve(expanded);
  };

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

  const envEauthInitialRefreshToken = process.env.EAUTH_INITIAL_REFRESH_TOKEN;
  const envEbayInitialRefreshToken = process.env.EBAY_INITIAL_REFRESH_TOKEN;
  if (hasValue(envEauthInitialRefreshToken) && hasValue(envEbayInitialRefreshToken) &&
      String(envEauthInitialRefreshToken).trim() !== String(envEbayInitialRefreshToken).trim()) {
    warnOnce(
      'env-mismatch:initial-refresh-token',
      '⚠️ Both EAUTH_INITIAL_REFRESH_TOKEN and EBAY_INITIAL_REFRESH_TOKEN are set but differ. ' +
        'This can cause rollback/conflicts across apps or mixed library versions. Prefer EAUTH_INITIAL_REFRESH_TOKEN and remove the EBAY_* alias (or keep them identical during migration).'
    );
  }

  const envEauthMasterKey = process.env.EAUTH_MASTER_KEY;
  const envEbayMasterKey = process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY;
  if (hasValue(envEauthMasterKey) && hasValue(envEbayMasterKey) &&
      String(envEauthMasterKey).trim() !== String(envEbayMasterKey).trim()) {
    warnOnce(
      'env-mismatch:master-key',
      '⚠️ Both EAUTH_MASTER_KEY and EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY are set but differ. ' +
        'This can cause decryption failures (e.g., "bad decrypt") across apps or mixed library versions. Prefer EAUTH_MASTER_KEY and remove the EBAY_* alias (or keep them identical during migration).'
    );
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
    envEauthMasterKey,
    envEbayMasterKey
  );

  if (!hasValue(options.masterKey) && !hasValue(fileConfig.masterKey) &&
      !hasValue(envEauthMasterKey) && hasValue(envEbayMasterKey)) {
    warnOnce(
      'deprecated:EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY',
      '⚠️ Using deprecated env var EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY. Please migrate to EAUTH_MASTER_KEY.'
    );
  }

  const databasePathInput = pick(options.databasePath, fileConfig.databasePath, process.env.EAUTH_DATABASE_PATH, process.env.EBAY_DATABASE_PATH);
  const databasePathDefault = './database/ebay_tokens.sqlite';
  const databasePath = resolveFsPath(databasePathInput || databasePathDefault);
  if (!databasePathInput) {
    warnOnce(
      'default:databasePath',
      `⚠️ EAUTH_DATABASE_PATH is not set; using default databasePath "${databasePathDefault}" resolved to "${databasePath}". ` +
        'In production/PM2, set an absolute EAUTH_DATABASE_PATH to avoid accidentally creating multiple empty DBs due to varying CWD.'
    );
  } else if (!path.isAbsolute(expandHome(databasePathInput)) && databasePathInput !== ':memory:') {
    warnOnce(
      'relative:databasePath',
      `⚠️ databasePath "${databasePathInput}" is relative and is resolved against process.cwd()="${process.cwd()}" to "${databasePath}". ` +
        'Consider using an absolute EAUTH_DATABASE_PATH to avoid CWD-related issues.'
    );
  }

  const tokenFilePathInput = pick(options.tokenFilePath, fileConfig.tokenFilePath, process.env.EAUTH_TOKEN_FILE_PATH, process.env.EBAY_TOKEN_FILE_PATH);
  const tokenFilePath = tokenFilePathInput ? resolveFsPath(tokenFilePathInput) : undefined;
  if (tokenFilePathInput && !path.isAbsolute(expandHome(tokenFilePathInput)) && tokenFilePathInput !== ':memory:') {
    warnOnce(
      'relative:tokenFilePath',
      `⚠️ tokenFilePath "${tokenFilePathInput}" is relative and is resolved against process.cwd()="${process.cwd()}" to "${tokenFilePath}". ` +
        'Consider using an absolute EAUTH_TOKEN_FILE_PATH to avoid CWD-related issues.'
    );
  }

  const ssotJsonPathInput = pick(options.ssotJsonPath, fileConfig.ssotJsonPath, process.env.EAUTH_SSOT_JSON, process.env.OAUTH_SSOT_JSON);
  const ssotJsonPath = ssotJsonPathInput ? resolveFsPath(ssotJsonPathInput) : undefined;
  if (ssotJsonPathInput && !path.isAbsolute(expandHome(ssotJsonPathInput)) && ssotJsonPathInput !== ':memory:') {
    warnOnce(
      'relative:ssotJsonPath',
      `⚠️ ssotJsonPath "${ssotJsonPathInput}" is relative and is resolved against process.cwd()="${process.cwd()}" to "${ssotJsonPath}". ` +
        'Consider using an absolute EAUTH_SSOT_JSON / OAUTH_SSOT_JSON path to avoid CWD-related issues.'
    );
  }

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
    databasePath,
    
    // File-based token storage configuration
    tokenFilePath,

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
    initialRefreshToken: pick(options.initialRefreshToken, fileConfig.initialRefreshToken, envEauthInitialRefreshToken, envEbayInitialRefreshToken),
    initialRefreshTokenMode: pick(
      options.initialRefreshTokenMode,
      fileConfig.initialRefreshTokenMode,
      process.env.EAUTH_INITIAL_REFRESH_TOKEN_MODE
    ),
    
    // Centralized JSON (SSOT) configuration
    ssotJsonPath,
    tokenNamespace: pick(options.tokenNamespace, fileConfig.tokenNamespace, process.env.EAUTH_TOKEN_NAMESPACE, process.env.TOKEN_NAMESPACE, 'ebay-oauth')
  };

  if (!hasValue(options.initialRefreshToken) && !hasValue(fileConfig.initialRefreshToken) &&
      !hasValue(envEauthInitialRefreshToken) && hasValue(envEbayInitialRefreshToken) && hasValue(config.initialRefreshToken)) {
    warnOnce(
      'deprecated:EBAY_INITIAL_REFRESH_TOKEN',
      '⚠️ Using deprecated env var EBAY_INITIAL_REFRESH_TOKEN. Please migrate to EAUTH_INITIAL_REFRESH_TOKEN.'
    );
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
    initialRefreshToken: 'your_manual_refresh_token_from_browser_oauth',
    encryptionEnabled: true,
    environment: 'PRODUCTION',
    // Centralized JSON (SSOT) configuration
    ssotJsonPath: '/var/secure/ebay/refresh-ssot.json',
    tokenNamespace: 'ebay-oauth'
  };
}
