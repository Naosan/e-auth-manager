// Dual Storage Refresh Token Seeder - Populates SQLite + encrypted JSON cache
import path from 'path';
import { fileURLToPath } from 'url';
import UserAccessToken_AuthorizationCodeManager from '../src/UserAccessToken_AuthorizationCodeManager.js';
import { loadConfig } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveDefaultDatabasePath() {
  return path.resolve(__dirname, '../database/ebay_tokens.sqlite');
}

function resolveDefaultTokenFilePath() {
  return path.resolve(__dirname, '../config/ebay-tokens.encrypted.json');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = {
    refreshToken: null,
    accountName: process.env.EBAY_ACCOUNT_NAME || 'default',
    appId: process.env.EBAY_APP_ID || process.env.EBAY_CLIENT_ID || null,
    databasePath: process.env.EBAY_DATABASE_PATH || null,
    tokenFilePath: process.env.EBAY_TOKEN_FILE_PATH || null,
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
    } else if (arg.startsWith('--database=')) {
      result.databasePath = arg.split('=')[1];
    } else if (arg === '--database') {
      result.databasePath = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--tokens=')) {
      result.tokenFilePath = arg.split('=')[1];
    } else if (arg === '--tokens') {
      result.tokenFilePath = args[i + 1];
      i += 1;
    }
  }

  if (!result.refreshToken) {
    result.refreshToken = process.env.EBAY_INITIAL_REFRESH_TOKEN;
  }

  // Normalize / defaults
  if (!result.databasePath) {
    result.databasePath = resolveDefaultDatabasePath();
  } else {
    result.databasePath = path.resolve(result.databasePath);
  }

  if (!result.tokenFilePath) {
    result.tokenFilePath = resolveDefaultTokenFilePath();
  } else {
    result.tokenFilePath = path.resolve(result.tokenFilePath);
  }

  return result;
}

async function seedDualStorage() {
  console.log('🪄 Dual Storage Refresh Token Seeder');
  const { refreshToken, accountName, appId, databasePath, tokenFilePath } = parseArgs(process.argv);

  if (!refreshToken) {
    console.error('\n❌ Missing refresh token.');
    console.error('   Pass it as the first argument, via --refresh-token, or set EBAY_INITIAL_REFRESH_TOKEN.');
    process.exit(1);
  }

  let manager;
  try {
    const config = loadConfig({ databasePath, tokenFilePath });
    const effectiveAppId = appId || config.defaultAppId;

    if (!effectiveAppId) {
      throw new Error('Unable to determine App ID. Set EBAY_CLIENT_ID or pass --app-id.');
    }

    manager = new UserAccessToken_AuthorizationCodeManager({
      ...config,
      databasePath,
      tokenFilePath,
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

    const resolvedDbPath = manager?.dbPath || databasePath;
    const resolvedTokenFile = manager?.fileTokenManager?.tokenFile || tokenFilePath;

    console.log(`🗄️ Database Path: ${resolvedDbPath}`);
    if (manager?.fileTokenManager) {
      console.log(`📁 Token File Path: ${resolvedTokenFile}`);
    } else {
      console.log(`📁 Token File Path: ${resolvedTokenFile} (file cache disabled or not configured)`);
    }

    await manager.saveUserAccessToken(accountName, tokenPayload);
    console.log('\n✅ Database and encrypted JSON cache seeded successfully.');

    if (manager?.fileTokenManager) {
      const cached = await manager.fileTokenManager.getToken(effectiveAppId);
      console.log('\n📄 Encrypted cache snapshot:');
      console.log('- Last updated:', cached?.lastUpdated || 'n/a');
      console.log('- Access token updated:', cached?.accessTokenUpdatedDate || 'n/a');
    } else {
      console.warn('\n⚠️ File token manager is not configured. Ensure encryption is enabled and a master key is provided.');
    }

    const dbToken = await manager.getTokenByAppId(effectiveAppId);
    if (dbToken) {
      console.log('\n🧾 Database record snapshot:');
      console.log('- Account name:', dbToken.account_name);
      console.log('- Updated at:', dbToken.updated_at);
      console.log('- Encrypted refresh token length:', dbToken.refresh_token?.length || 0);
    }

    console.log('\n🎉 Dual storage seeding completed successfully.');
  } catch (error) {
    console.error('\n🚨 Failed to seed dual storage:', error.message);
    process.exitCode = 1;
  } finally {
    if (manager?.db?.close) {
      await manager.db.close();
      manager.db = null;
    }
  }
}

seedDualStorage().catch(() => {
  process.exitCode = 1;
});
