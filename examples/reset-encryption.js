// Reset stored eBay tokens when the encryption key changes
import { UserAccessToken_AuthorizationCodeManager } from '../src/index.js';
import { loadConfig } from '../src/config.js';

async function resetEncryption() {
  console.log('🧹 Resetting encrypted token storage...');

  try {
    const config = loadConfig();
    const manager = new UserAccessToken_AuthorizationCodeManager(config);

    await manager.resetAllTokens();

    console.log('✅ Token storage cleared successfully. Re-seed refresh tokens for the new encryption key.');
    console.log('💡 Tip: Use examples/bulk-refresh-token-seed.js to load multiple refresh tokens after the reset.');
  } catch (error) {
    console.error('🚨 Failed to reset encrypted token storage:', error.message);
    process.exitCode = 1;
  }
}

resetEncryption();

