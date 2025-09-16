// Generate the default encrypted token file using LocalSharedTokenManager
// Requires EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY so the file can be shared across machines
import fs from 'fs/promises';
import path from 'path';
import LocalSharedTokenManager from '../src/LocalSharedTokenManager.js';

async function generateDefaultTokenFile() {
  console.log('🛠️ Generating default encrypted token file...');

  const masterKey = process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY;

  if (!masterKey) {
    console.error('🚨 Missing EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY environment variable.');
    console.log('   Set EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY before running this script so the encrypted file can be shared across machines.');
    process.exit(1);
  }

  try {
    const tokenManager = new LocalSharedTokenManager({ masterKey });

    const tokenDirectory = path.dirname(tokenManager.tokenFile);
    await fs.mkdir(tokenDirectory, { recursive: true });

    const appId = 'sample_default_app_id';
    const sampleToken = {
      accessToken: `sample_access_token_${Date.now()}`,
      refreshToken: `sample_refresh_token_${Date.now()}`,
      expiresIn: 7200,
      refreshTokenExpiresIn: 47304000,
      accessTokenUpdatedDate: new Date().toISOString(),
      refreshTokenUpdatedDate: new Date().toISOString(),
      tokenType: 'Bearer',
      scope: 'https://api.ebay.com/oauth/api_scope'
    };

    await tokenManager.saveToken(appId, sampleToken);
    console.log(`✅ Sample token saved for app ID: ${appId}`);

    const savedToken = await tokenManager.getToken(appId);
    if (savedToken) {
      console.log('🔎 Saved token preview:');
      console.log('   Token Type:', savedToken.tokenType);
      console.log('   Access Token Expires In:', savedToken.expiresIn, 'seconds');
      console.log('   Refresh Token Expires In:', savedToken.refreshTokenExpiresIn, 'seconds');
    }

    console.log(`\n📁 Encrypted token file written to: ${tokenManager.tokenFile}`);
    console.log('   Copy this file to other machines that use the same EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY.');
  } catch (error) {
    console.error('🚨 Failed to generate default token file:', error.message);
    process.exit(1);
  }
}

generateDefaultTokenFile();
