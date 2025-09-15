import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../src/config.js';
import { UserAccessToken_AuthorizationCodeManager } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load refresh token seed entries from environment configuration.
 * Supports both inline JSON (EBAY_REFRESH_TOKEN_SEED_JSON) and
 * a JSON file path (EBAY_REFRESH_TOKEN_SEED_FILE).
 *
 * Each entry must be of the form:
 * { "accountName": "sellerA", "appId": "AppID", "refreshToken": "v=1..." }
 */
async function loadSeedEntries() {
  const inlineJson = process.env.EBAY_REFRESH_TOKEN_SEED_JSON;
  const seedFile = process.env.EBAY_REFRESH_TOKEN_SEED_FILE;

  if (!inlineJson && !seedFile) {
    throw new Error('Set EBAY_REFRESH_TOKEN_SEED_JSON or EBAY_REFRESH_TOKEN_SEED_FILE to provide refresh tokens.');
  }

  let rawJson;
  if (seedFile) {
    const resolvedPath = path.isAbsolute(seedFile)
      ? seedFile
      : path.resolve(__dirname, '..', seedFile);
    console.log(`📄 Loading refresh token seed data from file: ${resolvedPath}`);
    rawJson = await fs.readFile(resolvedPath, 'utf8');
  } else {
    console.log('🧾 Loading refresh token seed data from EBAY_REFRESH_TOKEN_SEED_JSON environment variable');
    rawJson = inlineJson;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`Failed to parse refresh token seed JSON: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Refresh token seed data must be an array of { accountName, appId, refreshToken } objects.');
  }

  return parsed;
}

function normalizeEntry(entry, defaultAppId) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Each refresh token entry must be an object.');
  }

  const accountName = entry.accountName || 'default';
  const appId = entry.appId || defaultAppId;
  const refreshToken = entry.refreshToken;

  if (!refreshToken) {
    throw new Error(`Entry for account "${accountName}" is missing refreshToken.`);
  }

  if (!appId) {
    throw new Error(`Entry for account "${accountName}" is missing appId and no defaultAppId is configured.`);
  }

  return { accountName, appId, refreshToken };
}

async function main() {
  const config = loadConfig({ initialRefreshToken: undefined });
  const manager = new UserAccessToken_AuthorizationCodeManager({
    ...config,
    initialRefreshToken: undefined
  });

  const entries = await loadSeedEntries();
  let successCount = 0;
  let failureCount = 0;

  for (const entry of entries) {
    try {
      const normalized = normalizeEntry(entry, config.defaultAppId);
      console.log(`🔁 Seeding refresh token for account="${normalized.accountName}" appId="${normalized.appId}"`);
      await manager.setRefreshToken(normalized.refreshToken, normalized.accountName, normalized.appId);
      successCount += 1;
    } catch (error) {
      failureCount += 1;
      console.error('❗ Skipping entry due to error:', error.message);
    }
  }

  if (failureCount > 0) {
    console.warn(`⚠️ Completed with ${successCount} successful updates and ${failureCount} failures.`);
    process.exitCode = 1;
  } else {
    console.log(`🎉 Successfully seeded ${successCount} refresh tokens.`);
  }
}

main().catch((error) => {
  console.error('🚨 Failed to seed refresh tokens:', error);
  process.exit(1);
});
