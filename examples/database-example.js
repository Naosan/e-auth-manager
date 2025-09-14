// Database Storage Example - Using SQLite for token management
import { UserAccessToken_AuthorizationCodeManager } from '../src/index.js';
import { loadConfig } from '../src/config.js';

async function databaseExample() {
  try {
    console.log('🗄️ Database Storage Example');
    console.log('================================');

    // Load configuration from environment
    const config = loadConfig();
    console.log('✅ Configuration loaded successfully');

    // Create token manager with database storage
    const tokenManager = new UserAccessToken_AuthorizationCodeManager({
      ...config,
      databasePath: './examples/database/ebay_tokens.sqlite'
    });

    console.log('\n📊 Token Manager Configuration:');
    console.log('- Storage Type: SQLite Database');
    console.log('- Database Path:', './examples/database/ebay_tokens.sqlite');
    console.log('- Encryption Enabled:', config.encryptionEnabled);
    console.log('- Client ID:', config.clientId?.substring(0, 10) + '...');

    // Example: Check refresh token validity
    console.log('\n🔍 Checking refresh token validity...');
    const isValid = await tokenManager.checkRefreshTokenValidity();
    console.log('Refresh Token Valid:', isValid ? '✅ Yes' : '❌ No');

    if (isValid) {
      // Example: Get token by App ID
      console.log('\n🔑 Getting User Access Token by App ID...');
      const appId = config.defaultAppId || config.clientId;
      
      try {
        const token = await tokenManager.getUserAccessTokenByAppId(appId);
        console.log('✅ Token retrieved successfully');
        console.log('Token Length:', token?.length || 0, 'characters');
        console.log('Token Preview:', token?.substring(0, 20) + '...' || 'N/A');
      } catch (error) {
        console.log('❌ Failed to get token:', error.message);
        console.log('💡 This is normal if no tokens are stored yet');
      }

      // Example: Get token by account name
      console.log('\n🔑 Getting User Access Token by account name...');
      try {
        const token = await tokenManager.getUserAccessToken('default');
        console.log('✅ Token retrieved successfully');
        console.log('Token Length:', token?.length || 0, 'characters');
      } catch (error) {
        console.log('❌ Failed to get token:', error.message);
      }
    }

    console.log('\n✅ Database example completed successfully');
    
  } catch (error) {
    console.error('\n🚨 Database example failed:', error.message);
    
    if (error.message.includes('Missing required environment variables')) {
      console.log('\n💡 Setup Instructions:');
      console.log('1. Create a .env file in the package root');
      console.log('2. Add your eBay API credentials:');
      console.log('   EBAY_CLIENT_ID=your_client_id');
      console.log('   EBAY_CLIENT_SECRET=your_client_secret');
      console.log('   EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_secure_master_key');
      console.log('3. Run the example again');
    }
    
    process.exit(1);
  }
}

// Run the example
databaseExample();