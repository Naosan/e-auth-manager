// Set up test environment variables before any imports
// NOTE: Keep tests hermetic: avoid loading developer/local `.env` values.
import os from 'os';
import path from 'path';

const tempDir = path.join(os.tmpdir(), 'e-auth-manager-tests');

process.env.NODE_ENV = 'test';

// Preferred env names
process.env.EAUTH_EBAY_CLIENT_ID = 'test-client-id';
process.env.EAUTH_EBAY_CLIENT_SECRET = 'test-client-secret';
process.env.EAUTH_MASTER_KEY = 'test-master-key';
process.env.EAUTH_ACCOUNT_NAME = 'test-account';

// Ensure no auto-seeding occurs during unit tests
process.env.EAUTH_INITIAL_REFRESH_TOKEN = '';

// Keep backwards-compatible aliases aligned (some code/tests still use EBAY_*)
process.env.EBAY_CLIENT_ID = 'test-client-id';
process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY = 'test-master-key';
process.env.EBAY_ACCOUNT_NAME = 'test-account';
process.env.EBAY_INITIAL_REFRESH_TOKEN = '';

// Route any default storage to temp so tests don't touch local token storage
process.env.EAUTH_DATABASE_PATH = path.join(tempDir, 'ebay_tokens.sqlite');
process.env.EBAY_DATABASE_PATH = process.env.EAUTH_DATABASE_PATH;
process.env.EAUTH_TOKEN_FILE_PATH = path.join(tempDir, 'ebay-tokens.encrypted.json');
process.env.EBAY_TOKEN_FILE_PATH = process.env.EAUTH_TOKEN_FILE_PATH;
