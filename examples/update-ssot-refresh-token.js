// Quick SSOT refresh token updater
import path from 'path';
import { fileURLToPath } from 'url';
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDefaultSsotPath() {
  return path.resolve(__dirname, '../config/refresh-ssot.json');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    refreshToken: null,
    accountName: process.env.EBAY_ACCOUNT_NAME || 'default',
    appId: process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || null,
    ssotPath: process.env.OAUTH_SSOT_JSON || null,
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
    } else if (arg.startsWith('--ssot=')) {
      result.ssotPath = arg.split('=')[1];
    } else if (arg === '--ssot') {
      result.ssotPath = args[i + 1];
      i += 1;
    }
  }

  if (!result.refreshToken) {
    result.refreshToken = process.env.EBAY_INITIAL_REFRESH_TOKEN;
  }

  if (!result.ssotPath) {
    result.ssotPath = resolveDefaultSsotPath();
  } else {
    result.ssotPath = path.resolve(result.ssotPath);
  }

  return result;
}

async function updateSsot() {
  console.log('🔄 eBay OAuth Token Manager - SSOT Refresh Token Updater');
  const { refreshToken, accountName, appId, ssotPath } = parseArgs(process.argv);

  if (!refreshToken) {
    console.error('\n❌ Missing refresh token.');
    console.error('   Pass it as the first argument, via --refresh-token, or set EBAY_INITIAL_REFRESH_TOKEN.');
    process.exit(1);
  }

  let manager;
  try {
    const config = loadConfig({ ssotJsonPath: ssotPath });
    const effectiveAppId = appId || config.defaultAppId;

    if (!effectiveAppId) {
      throw new Error('Unable to determine App ID. Set EBAY_CLIENT_ID or pass --app-id.');
    }

    manager = new UserAccessToken_AuthorizationCodeManager({
      ...config,
      ssotJsonPath: ssotPath,
    });

    const now = new Date().toISOString();
    const tokenPayload = {
      accessToken: 'initial_placeholder_token',
      refreshToken,
      accessTokenUpdatedDate: '1970-01-01T00:00:00.000Z',
      refreshTokenUpdatedDate: now,
      expiresIn: 1,
      refreshTokenExpiresIn: 47304000,
      tokenType: 'Bearer',
      appId: effectiveAppId,
    };

    console.log(`\n👤 Account Name: ${accountName}`);
    console.log(`🆔 App ID: ${effectiveAppId}`);
    console.log(`📁 SSOT Path: ${ssotPath}`);

    await manager.saveUserAccessToken(accountName, tokenPayload);
    console.log('✅ Database and encrypted JSON cache updated.');

    if (manager.tokenProvider) {
      const current = await manager.tokenProvider.get(effectiveAppId);
      const nextVersion = ((current?.version ?? 0) + 1);
      await manager.tokenProvider.set(effectiveAppId, refreshToken, nextVersion);
      const latest = await manager.tokenProvider.get(effectiveAppId);
      console.log(`✅ SSOT updated (version ${latest?.version ?? 'n/a'}, updatedAt ${latest?.updatedAt || 'n/a'}).`);
    } else {
      console.warn('\n⚠️ SSOT provider is not configured.');
      console.warn('   Ensure EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY and OAUTH_SSOT_JSON are set for multi-instance sync.');
    }

    console.log('\n🎉 Refresh token update completed successfully.');
  } catch (error) {
    console.error('\n🚨 Failed to update refresh token:', error.message);
    process.exitCode = 1;
  } finally {
    if (manager?.db?.close) {
      await manager.db.close();
      manager.db = null;
    }
  }
}

updateSsot().catch(() => {
  process.exitCode = 1;
});
