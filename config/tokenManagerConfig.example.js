// Example configuration file for eBay OAuth Token Manager
// Copy this file to tokenManagerConfig.js and update with your credentials
// DO NOT commit tokenManagerConfig.js to version control

export const TOKEN_CONFIG = {
  // eBay API Credentials (REQUIRED)
  // Get these from https://developer.ebay.com/my/keys
  clientId: 'your_ebay_client_id',
  clientSecret: 'your_ebay_client_secret',
  
  // Default App ID for token storage and retrieval
  defaultAppId: 'your_default_app_id',
  
  // eBay API Environment
  environment: 'PRODUCTION', // or 'SANDBOX'
  
  // Token Storage Strategy
  useDatabase: true,          // Use SQLite database storage
  useLegacyFile: false,       // Use encrypted file storage
  
  // Database Configuration (when useDatabase = true)
  databasePath: './database/ebay_tokens.sqlite',
  
  // File Storage Configuration (when useLegacyFile = true)
  tokenFilePath: null, // Uses default OS-specific path if null
  
  // Security Configuration
  encryptionEnabled: true,
  masterKey: 'your_secure_master_key_change_me_in_production',
  
  // API Configuration (rarely needs to be changed)
  tokenUrl: 'https://api.ebay.com/identity/v1/oauth2/token',
  scope: 'https://api.ebay.com/oauth/api_scope'
};

// Usage example:
// import { TOKEN_CONFIG } from './config/tokenManagerConfig.js';
// import { UserAccessToken_AuthorizationCodeManager } from '@your-org/ebay-oauth-token-manager';
// 
// const tokenManager = new UserAccessToken_AuthorizationCodeManager(TOKEN_CONFIG);