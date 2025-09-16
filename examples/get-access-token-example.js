// Access Token Retrieval Example - Exchanges a refresh token for a live access token
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from '../src/config.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    refreshToken: null,
    accountName: process.env.EBAY_ACCOUNT_NAME || 'default',
    appId: process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;

    if (!arg.startsWith('--') && !result.refreshToken) {
      result.refreshToken = arg;
      continue;
    }

    if (arg.startsWith('--refresh-token=')) {
      result.refreshToken = arg.split('=')[1];
    } else if (arg === '--refresh-token') {
      result.refreshToken = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--account=')) {
      result.accountName = arg.split('=')[1];
    } else if (arg === '--account') {
      result.accountName = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--app-id=')) {
      result.appId = arg.split('=')[1];
    } else if (arg === '--app-id') {
      result.appId = args[i + 1];
      i += 1;
    }
  }

  if (!result.refreshToken) {
    result.refreshToken = process.env.EBAY_INITIAL_REFRESH_TOKEN;
  }

  return result;
}

async function fetchAccessToken() {
  console.log('🔐 Access Token Retrieval Example');
  console.log('=================================');

  let manager;

  try {
    const { refreshToken, accountName, appId: providedAppId } = parseArgs(process.argv);
    if (!refreshToken) {
      throw new Error('No refresh token provided. Pass one as the first argument, via --refresh-token, or set EBAY_INITIAL_REFRESH_TOKEN.');
    }

    const config = loadConfig();
    console.log('✅ Configuration loaded successfully');

    const effectiveAppId = providedAppId || config.defaultAppId || config.clientId;
    if (!effectiveAppId) {
      throw new Error('Unable to determine App ID. Set EBAY_CLIENT_ID or pass --app-id.');
    }

    manager = new UserAccessToken_AuthorizationCodeManager(config);

    console.log('\n👤 Account Name:', accountName);
    console.log('🆔 App ID:', effectiveAppId);

    console.log('\n💾 Seeding refresh token (stored securely if not present)...');
    await manager.setRefreshToken(refreshToken, accountName, effectiveAppId);

    console.log('\n⚙️ Requesting fresh access token from eBay...');
    const accessToken = await manager.getUserAccessTokenByAppId(effectiveAppId);

    console.log('\n✅ Access token acquired successfully!');
    console.log('- Length:', accessToken?.length || 0);
    console.log('- Preview:', accessToken ? `${accessToken.substring(0, 40)}...` : 'N/A');
  } catch (error) {
    console.error('\n🚨 Failed to retrieve access token:', error.message);
    if (error.response?.data) {
      console.error('   eBay response:', JSON.stringify(error.response.data));
    }
    console.error('\n💡 Tips:');
    console.error('   • Ensure EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are valid.');
    console.error('   • Verify the refresh token is active and matches the App ID.');
    console.error('   • Check network connectivity to api.ebay.com.');
    process.exitCode = 1;
  } finally {
    if (manager?.db?.close) {
      await manager.db.close();
      manager.db = null;
    }
  }
}

fetchAccessToken();
