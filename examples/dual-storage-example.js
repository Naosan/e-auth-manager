// Dual Storage Example - Demonstrates automatic Database + Encrypted JSON persistence
import fs from 'fs/promises';
import path from 'path';
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from '../src/config.js';

async function dualStorageExample() {
  console.log('🔐 Dual Storage Example');
  console.log('=======================');

  let manager;

  try {
    const config = loadConfig();
    console.log('✅ Configuration loaded successfully');

    const databasePath = './examples/dual-storage/ebay_tokens.sqlite';
    const tokenFilePath = './examples/dual-storage/ebay-tokens.encrypted.json';

    console.log('\n📁 Storage destinations:');
    console.log('- SQLite database:', path.resolve(databasePath));
    console.log('- Encrypted JSON file:', path.resolve(tokenFilePath));
    console.log('- Master key source:', config.customMasterKeyProvided ? 'Custom (shared across machines)' : 'Hostname fallback (machine-specific)');

    manager = new UserAccessToken_AuthorizationCodeManager({
      ...config,
      databasePath,
      tokenFilePath
    });

    const accountName = 'demo-account';
    const appId = config.defaultAppId || config.clientId;
    console.log('\n👤 Account Name:', accountName);
    console.log('🆔 App ID:', appId);

    const now = new Date().toISOString();
    const sampleToken = {
      appId,
      accessToken: `sample_access_token_${Date.now()}`,
      refreshToken: `sample_refresh_token_${Date.now()}`,
      expiresIn: 7200,
      refreshTokenExpiresIn: 47304000,
      accessTokenUpdatedDate: now,
      refreshTokenUpdatedDate: now,
      tokenType: 'Bearer'
    };

    console.log('\n💾 Saving sample token payload (forces dual persistence)...');
    await manager.saveUserAccessToken(accountName, sampleToken);
    console.log('✅ Token saved to SQLite and encrypted JSON cache');

    console.log('\n🔑 Reading token via manager (uses cache ➜ JSON ➜ database fallbacks)...');
    const accessToken = await manager.getUserAccessTokenByAppId(appId);
    console.log('Access token preview:', accessToken ? `${accessToken.substring(0, 30)}...` : 'N/A');

    if (manager.fileTokenManager) {
      const jsonToken = await manager.fileTokenManager.getToken(appId);
      console.log('\n📄 Encrypted JSON cache contents:');
      console.log('- Last updated:', jsonToken?.lastUpdated || 'n/a');
      console.log('- Access token updated:', jsonToken?.accessTokenUpdatedDate || 'n/a');
      console.log('- Access token preview:', jsonToken?.accessToken ? `${jsonToken.accessToken.substring(0, 30)}...` : 'n/a');
    } else {
      console.warn('\n⚠️ File token manager is disabled. Ensure encryption is enabled and a master key is provided.');
    }

    const dbToken = await manager.getTokenByAppId(appId);
    if (dbToken) {
      console.log('\n🗄️ SQLite record snapshot:');
      console.log('- Account name:', dbToken.account_name);
      console.log('- Updated at:', dbToken.updated_at);
      console.log('- Encrypted access token length:', dbToken.access_token?.length || 0);
    }

    try {
      const fileStats = await fs.stat(path.resolve(tokenFilePath));
      console.log('\n📦 Encrypted JSON file size:', `${fileStats.size} bytes`);
    } catch (statError) {
      console.warn('\n⚠️ Could not inspect encrypted JSON file:', statError.message);
    }

    console.log('\n✅ Dual storage example completed successfully');
  } catch (error) {
    console.error('\n🚨 Dual storage example failed:', error.message);

    if (error.message.includes('Missing required environment variables')) {
      console.log('\n💡 Setup Instructions:');
      console.log('1. Create a .env file in the package root');
      console.log('2. Add your eBay API credentials:');
      console.log('   EBAY_CLIENT_ID=your_client_id');
      console.log('   EBAY_CLIENT_SECRET=your_client_secret');
      console.log('3. Provide a master key so encrypted files can be shared across machines:');
      console.log('   EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_secure_master_key');
      console.log('4. (Optional) Override storage paths if needed:');
      console.log('   EBAY_DATABASE_PATH=./database/ebay_tokens.sqlite');
      console.log('   EBAY_TOKEN_FILE_PATH=./ebay-oauth-tokens/ebay-tokens.encrypted.json');
      console.log('5. Run the example again:');
      console.log('   node examples/dual-storage-example.js');
    }

    process.exit(1);
  } finally {
    if (manager?.db?.close) {
      await manager.db.close();
      manager.db = null;
    }
  }
}

dualStorageExample();
