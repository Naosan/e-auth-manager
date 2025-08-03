// File Storage Example - Using encrypted file for token management
import { LocalSharedTokenManager } from '../src/index.js';
import { loadConfig } from '../src/config.js';

async function fileExample() {
  try {
    console.log('📁 File Storage Example');
    console.log('========================');

    // Load configuration from environment
    const config = loadConfig();
    console.log('✅ Configuration loaded successfully');

    // Create token manager with file storage
    const tokenManager = new LocalSharedTokenManager({
      masterKey: config.masterKey,
      tokenFilePath: './examples/tokens/ebay-tokens.encrypted.json'
    });

    console.log('\n📊 Token Manager Configuration:');
    console.log('- Storage Type: Encrypted File');
    console.log('- Token File Path:', './examples/tokens/ebay-tokens.encrypted.json');
    console.log('- Encryption Algorithm: AES-256-GCM');
    console.log('- Master Key Preview:', config.masterKey?.substring(0, 10) + '...');

    // Example: Check refresh token validity
    console.log('\n🔍 Checking refresh token validity...');
    const isValid = await tokenManager.checkRefreshTokenValidity();
    console.log('Refresh Token Valid:', isValid ? '✅ Yes' : '❌ No');

    // Example: Create sample token data (for demonstration)
    console.log('\n💾 Creating sample token data...');
    const sampleTokenData = {
      accessToken: 'sample_access_token_' + Date.now(),
      refreshToken: 'sample_refresh_token_' + Date.now(),
      expiresIn: 7200,
      refreshTokenExpiresIn: 47304000,
      accessTokenUpdatedDate: new Date().toISOString(),
      refreshTokenUpdatedDate: new Date().toISOString(),
      tokenType: 'Bearer'
    };

    const appId = config.defaultAppId || 'sample_app_id';
    await tokenManager.saveToken(appId, sampleTokenData);
    console.log('✅ Sample token saved successfully');

    // Example: Retrieve the token
    console.log('\n🔑 Retrieving saved token...');
    const retrievedToken = await tokenManager.getToken(appId);
    
    if (retrievedToken) {
      console.log('✅ Token retrieved successfully');
      console.log('Token Type:', retrievedToken.tokenType);
      console.log('Expires In:', retrievedToken.expiresIn, 'seconds');
      console.log('Last Updated:', retrievedToken.lastUpdated);
      console.log('Access Token Preview:', retrievedToken.accessToken?.substring(0, 20) + '...');
    } else {
      console.log('❌ No token found or token expired');
    }

    // Example: Demonstrate encryption/decryption
    console.log('\n🔐 File Encryption Details:');
    console.log('- The token file is encrypted with AES-256-GCM');
    console.log('- Each machine uses a unique encryption key');
    console.log('- Authentication tags prevent tampering');
    console.log('- File locking prevents concurrent access issues');

    console.log('\n✅ File example completed successfully');
    
  } catch (error) {
    console.error('\n🚨 File example failed:', error.message);
    
    if (error.message.includes('Missing required environment variables')) {
      console.log('\n💡 Setup Instructions:');
      console.log('1. Create a .env file in the package root');
      console.log('2. Add your master key:');
      console.log('   EBAY_MASTER_KEY=your_secure_master_key');
      console.log('3. Optionally add eBay credentials for full functionality:');
      console.log('   EBAY_CLIENT_ID=your_client_id');
      console.log('   EBAY_CLIENT_SECRET=your_client_secret');
      console.log('4. Run the example again');
    }
    
    process.exit(1);
  }
}

// Run the example
fileExample();