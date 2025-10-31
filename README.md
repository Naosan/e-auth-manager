# eBay OAuth Token Manager

**A comprehensive Node.js library for managing eBay OAuth 2.0 tokens with enterprise-grade features**
[![Node.js Compatible](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Overview

This library provides robust OAuth 2.0 token management for eBay APIs with sophisticated multi-layered caching, encryption, and distributed coordination. Designed for production environments requiring high performance and security.

### 🎯 Key Benefits

- **Zero Configuration**: Works out-of-the-box with automatic dual storage
- **Cross-Platform Support**: Works seamlessly on Windows, macOS, and Linux
- **Production Ready**: Battle-tested multi-layer caching and error recovery
- **Enterprise Security**: AES-256 encryption with machine-specific keys (GCM for DB/SSOT, CBC for local file)
- **Multi-Instance Coordination**: SSOT (Single Source of Truth) prevents token conflicts
- **API-Specific Optimization**: Dedicated managers for Trading API vs Browse API

---

## 🚀 Quick Start

### Installation

```bash
npm install @naosan-internal/pipeline-kit
```

### Basic Usage

```javascript
import {
  getTradingApiToken,
  getBrowseApiToken,
  getMarketingApiToken
} from '@naosan-internal/pipeline-kit';

// Trading API (User Access Tokens)
const tradingToken = await getTradingApiToken('your-app-id');

// Browse API (Application Access Tokens)
const browseToken = await getBrowseApiToken();

// Marketing API (User Access Tokens)
const marketingToken = await getMarketingApiToken('your-app-id');
```

### Choosing the Right Token

Use the appropriate token type based on the API family and whether user consent is required:

- Application Access Token (Client Credentials)
  - When: Public data, no user context
  - APIs: Browse, Taxonomy (and most other Buy* read-only APIs)
  - How: `getBrowseApiToken()`, `getTaxonomyApiToken()`
  - Requirements: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (no refresh token needed)

- User Access Token (IAF; Authorization Code)
  - When: User account–scoped operations that require consent
  - APIs: Trading, Sell Metadata, Marketing (e.g., promotions & campaigns)
  - How: `getTradingApiToken()`, `getSellMetadataApiToken()`, `getMarketingApiToken()`
  - Requirements: Initial refresh token (via manual OAuth). Seed with `EBAY_INITIAL_REFRESH_TOKEN` or call `setRefreshToken()`

### Environment Setup

1. Copy `.env.example` to `.env` and fill in your credentials.
2. Start with the minimal variables below, then opt into advanced options as your deployment requires.

| Type | Keys | Notes |
| --- | --- | --- |
| **Required** | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Needed for every token request. |
| **Security (optional)** | `EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY` | Overrides the per-machine default (hostname). Needed only when sharing encrypted tokens across hosts. |
| **Default refresh token** | `EBAY_INITIAL_REFRESH_TOKEN` | Seeds only the `default` account for the configured `defaultAppId` (by default this is `EBAY_CLIENT_ID`) the first time the manager runs. |
| **Coordination** | `OAUTH_SSOT_JSON`, `TOKEN_NAMESPACE` | Optional SSOT JSON file that keeps multi-instance deployments in sync. |
| **Environment** | `EBAY_ENVIRONMENT` | Choose `PRODUCTION` or `SANDBOX` (defaults to production). |

If you don't provide a master key, the library automatically falls back to the current
machine's hostname. Tokens encrypted with the default key can be decrypted across
restarts on that same host, but they cannot be shared across different machines without
specifying a custom key. This also applies to SSOT coordination—set
`EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY` whenever `OAUTH_SSOT_JSON` is used so every
instance can decrypt the shared file.

```bash
# Minimal example
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret

# Optional: override the per-machine default encryption key (hostname fallback is automatic)
# EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=generate_a_secure_key
```

> **Note:** `EBAY_INITIAL_REFRESH_TOKEN` does **not** update every account automatically. It seeds only the default account/App ID combination. Use the helper script or call `setRefreshToken` for any additional pairs.

### Bulk seeding refresh tokens

Detailed instructions for the `examples/bulk-refresh-token-seed.js` helper now live in [`docs/bulk-refresh-token-seeding.md`](docs/bulk-refresh-token-seeding.md) to minimize README merge conflicts. The guide covers preparing JSON seed data, running the script, and interpreting the results.

<!-- Old, duplicated seeding details removed. See the dedicated doc instead. -->

---

## 🏗️ Architecture

### Multi-Layer Token Retrieval System

The library implements a sophisticated 5-layer retrieval system:

```
1. Memory Cache (~1ms)          ← Fastest
2. JSON File Cache (~10ms)      
3. SQLite Database (~50ms)      
4. SSOT Provider (coordination) 
5. eBay API (~500ms)           ← Slowest (last resort)
```

### Core Components

| Component | Purpose | Token Types |
|-----------|---------|-------------|
| **UserAccessToken_AuthorizationCodeManager** | Trading API tokens | User Access Tokens (18-month expiry) |
| **ApplicationAccessToken_ClientCredentialsManager** | Browse API tokens | Application Access Tokens (2-hour expiry) |
| **FileJsonTokenProvider** | Multi-instance coordination | SSOT (Single Source of Truth) |
| **LocalSharedTokenManager** | Cross-project sharing | Encrypted JSON storage |

---

## 📚 API Reference

### Trading API (User Access Tokens)

For private operations requiring user authorization:

```javascript
import { UserAccessToken_AuthorizationCodeManager } from '@naosan-internal/pipeline-kit';

const manager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  masterKey: 'your_encryption_key'
});

// Set initial refresh token (manual browser OAuth flow required)
await manager.setRefreshToken('your_refresh_token', 'account_name');

// Get access token (auto-refresh if expired)
const token = await manager.getUserAccessTokenByAppId('your_app_id');

// Token information
const info = await manager.getUserTokenInfo('your_app_id');
const expiration = await manager.getUserTokenExpiration('your_app_id');
const accountName = await manager.getUserAccountName('your_app_id');
```

#### Refresh token health checks

```javascript
import { checkRefreshTokenValidity, getRefreshTokenHealth } from '@naosan-internal/pipeline-kit';

const isHealthy = await checkRefreshTokenValidity('your_app_id');
const health = await getRefreshTokenHealth('your_app_id');

console.log(health);
// {
//   appId: 'your_app_id',
//   isValid: false,
//   source: null,
//   layers: {
//     database: { attempted: true, status: 'invalid', message: 'No valid refresh token found in database', error: null },
//     encryptedJson: { attempted: true, status: 'invalid', message: 'No valid refresh token found in encrypted JSON cache', error: null }
//   }
// }
```

- The check now mirrors the runtime retrieval order: **database → encrypted JSON cache** (with both layers guarded by the same encryption key logic).
- If the SQLite store is empty but the shared encrypted JSON still holds a valid refresh token, the helper returns `true` so multi-project setups stay operational.
- `getRefreshTokenHealth(appId)` exposes the same decision tree with diagnostics, including the layer that produced the valid token (or why none were found). Possible `status` values are `valid`, `invalid`, `error`, `not_available`, and `not_attempted`.
- Use actual token retrieval (`getTradingApiToken(appId)` or similar) when you want to assert full API readiness—those calls already fall back in the same order and refresh automatically when needed.

### Browse API (Application Access Tokens)

For public data access:

```javascript
import { ApplicationAccessToken_ClientCredentialsManager } from '@naosan-internal/pipeline-kit';

const manager = new ApplicationAccessToken_ClientCredentialsManager({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret'
});

// Get application token (auto-refresh if expired)
const token = await manager.getApplicationAccessToken();
```

### Sell Metadata (User Access Tokens)

For marketplace/category metadata like conditionId/conditionName:

```javascript
import { getSellMetadataApiToken } from '@naosan-internal/pipeline-kit';
const token = await getSellMetadataApiToken();
// Example endpoint:
// GET https://api.ebay.com/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies?category_id=123
```

See `examples/sell-metadata-item-conditions.js` for a runnable script.

### Marketing API (User Access Tokens)

For promotions, ad campaigns, and merchandising workflows:

```javascript
import { getMarketingApiToken } from '@naosan-internal/pipeline-kit';

const token = await getMarketingApiToken('your_app_id', {
  readOnly: false,    // Set true for sell.marketing.readonly scope
  forceRefresh: false // Set true to force refresh with Marketing scopes every call
});

// Example endpoint:
// GET https://api.ebay.com/sell/marketing/v1/ad_campaign
```

> ⚠️ 事前に `sell.marketing` または `sell.marketing.readonly` を含むスコープで取得したリフレッシュトークンが必要です。

### Multi-Instance Coordination (SSOT)

Prevent refresh token conflicts across multiple instances:

```javascript
const manager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
  masterKey: 'your_encryption_key',

  // SSOT Configuration
  ssotJsonPath: '/secure/path/tokens.json',
  tokenNamespace: 'my-app'
});
```

#### ⚡️ Quick SSOT refresh token updater

When you receive a new refresh token (for example, after rotating credentials), run the helper script below to push the value to the SQLite database, the encrypted JSON cache, and the SSOT file in one step.

1. Confirm your `.env` contains the core production credentials:
   ```env
   EBAY_CLIENT_ID=your_production_client_id
   EBAY_CLIENT_SECRET=your_production_client_secret
   EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_shared_master_key
   EBAY_ACCOUNT_NAME=tokyo-1uppers
   # Optional: SSOT location
   # For multi-instance sync, set an explicit path. The repository no longer tracks
   # config/refresh-ssot.json (gitignored). Point to a secure location instead:
   # OAUTH_SSOT_JSON=/secure/shared/refresh-ssot.json
   ```
2. Execute the updater with the fresh refresh token:
   ```bash
   node examples/update-ssot-refresh-token.js "v=1.abcdefg"
   ```
   You can also pass flags for custom setups:
   ```bash
   node examples/update-ssot-refresh-token.js \
     --refresh-token "v=1.abcdefg" \
     --account tokyo-1uppers \
     --app-id YourAppID \
     --ssot /secure/shared/refresh-ssot.json
   ```

The script increments the SSOT version when it writes the encrypted refresh token so that other instances immediately recognize the update.

> Security note: `config/refresh-ssot.json` is intentionally excluded from Git and should not be committed. If you want a local placeholder, copy `config/refresh-ssot.example.json` to `config/refresh-ssot.json` on your machine or set `OAUTH_SSOT_JSON` to a secure shared path.

#### 🪄 Dual storage refresh token seeder

Need to initialize both the SQLite database and the encrypted JSON cache (dual storage) with a refresh token? Use the companion seeding script to populate both locations in one command.

1. Provide your credentials and optional storage overrides via environment variables:
   ```env
   EBAY_CLIENT_ID=your_production_client_id
   EBAY_CLIENT_SECRET=your_production_client_secret
   EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_shared_master_key
   # Optional: override storage destinations (defaults match the library)
   # EBAY_DATABASE_PATH=./database/ebay_tokens.sqlite
   # EBAY_TOKEN_FILE_PATH=./config/ebay-tokens.encrypted.json
   ```
2. Run the seeder with the refresh token you received from eBay:
   ```bash
   node examples/seed-dual-storage-refresh-token.js "v=1.abcdefg"
   ```
   Or pass explicit flags when you have multiple accounts or non-default paths:
   ```bash
   node examples/seed-dual-storage-refresh-token.js \
     --refresh-token "v=1.abcdefg" \
     --account tokyo-1uppers \
     --app-id YourAppID \
     --database ./database/ebay_tokens.sqlite \
     --tokens ./config/ebay-tokens.encrypted.json
   ```

The script saves tokens using the same encryption modes as the library: database fields are encrypted with AES-256-GCM, and the local JSON cache uses AES-256-CBC. This matches the default behaviour of `UserAccessToken_AuthorizationCodeManager`, making it easy to bootstrap new environments or recover from accidental file deletions.

---

## 💾 Token Storage Details

### Storage Locations

The library automatically creates storage directories and manages token persistence across multiple locations:

#### 1. SQLite Database (Primary Storage)
**Location**: `./database/ebay_tokens.sqlite` (configurable)
**Contains**:
- `access_token` - Encrypted access tokens (AES-256-GCM)
- `refresh_token` - Encrypted refresh tokens (AES-256-GCM) 
- `account_name` - eBay account identifier (unique key)
- `app_id` - eBay application ID
- `expires_in` - Token expiration time (seconds)
- Token metadata and timestamps

#### 2. Encrypted JSON File (Dual Storage)
Default locations (auto-created):
**Windows**: `%LOCALAPPDATA%\ebay-oauth-tokens\ebay-tokens.encrypted.json` (fallback: `%APPDATA%`)
**macOS**: `~/Library/Application Support/ebay-oauth-tokens/ebay-tokens.encrypted.json`
**Linux**: `~/.local/share/ebay-oauth-tokens/ebay-tokens.encrypted.json` (or `$XDG_DATA_HOME`)
**Contains**:
- Complete token data (access + refresh tokens)
- Expiration information and timestamps
- AES-256-CBC encryption with machine-specific keys

#### 3. SSOT Provider (Multi-Instance Coordination)
**Location**: Configurable via `ssotJsonPath` option
**Contains**:
- `refreshTokenEnc` - Encrypted refresh tokens only (AES-256-GCM)
- Version control for coordinated updates
- Process-safe locking mechanisms

### Token Types Stored

| Token Type | Storage Location | Encryption | Lifetime | Purpose |
|------------|------------------|------------|----------|---------|
| **User Access Token** | Database + JSON | AES-256-GCM (DB), AES-256-CBC (JSON) | ~2 hours | Trading API access |
| **User Refresh Token** | Database + JSON + SSOT | AES-256-GCM (DB/SSOT), AES-256-CBC (JSON) | ~18 months | Token renewal |
| **Application Access Token** | Memory only | None | ~2 hours | Browse API access |

### Automatic Directory Creation

The library automatically creates necessary directories with proper permissions across all platforms:

```javascript
// Cross-platform token storage paths (follows npm/CLI tool conventions):

// Windows (User-specific data in LOCALAPPDATA - prevents roaming sync issues)
%LOCALAPPDATA%\ebay-oauth-tokens\     // C:\Users\[USER]\AppData\Local\ebay-oauth-tokens\
%APPDATA%\ebay-oauth-tokens\          // Fallback: C:\Users\[USER]\AppData\Roaming\ebay-oauth-tokens\

// macOS (Application Support directory)
~/Library/Application Support/ebay-oauth-tokens/

// Linux/Unix (XDG Base Directory specification)
~/.local/share/ebay-oauth-tokens/     // Default location
$XDG_DATA_HOME/ebay-oauth-tokens/     // If XDG_DATA_HOME is set

// Database directory
./database/ (or custom path)
  └── ebay_tokens.sqlite

// SSOT directory (if configured)
/custom/path/
  └── shared-tokens.json
  └── .locks/ (for process coordination)

// Legacy migration support (automatically detected)
// - Previous PROGRAMDATA location (Windows)
// - Original EStocks/tokens/ location (all platforms)
```

---

## 🔐 Security Features

### Encryption Modes

- **Database (SQLite) fields**: AES-256-GCM (authenticated encryption)
- **Local JSON cache**: AES-256-CBC (compatible and efficient for file payloads)
- **SSOT (central JSON)**: AES-256-GCM with AAD

All modes use machine-specific keys by default and unique initialization vectors per encryption.

### Secure Key Management

By default the library derives its encryption key from the current machine's hostname so tokens remain decryptable across
restarts on that host. Provide your own master key when you need a stable key that works across multiple machines or when you
plan to rotate keys explicitly.

```javascript
// Environment variable (optional, recommended for multi-host setups)
// Optional override; defaults to hostname-derived key when omitted
EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_256_bit_secure_key

// Or via configuration
const manager = new UserAccessToken_AuthorizationCodeManager({
  // Optional override; leave unset to use the per-machine default key
  masterKey: process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY
});
```

### Encryption Key Fingerprint & Automatic Reset

- The manager stores a SHA-256 fingerprint of the derived encryption key inside the SQLite database (`oauth_metadata` table).
- On startup the fingerprint is compared to the current key. If they differ, the library automatically:
  - Deletes every row in `ebay_oauth_tokens`.
  - Removes the encrypted JSON cache (including `.lock`/backup files).
  - Logs a warning explaining that tokens were purged because the key changed.
- After rotating `EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY`, re-seed refresh tokens (e.g., via `EBAY_INITIAL_REFRESH_TOKEN` or the bulk seeding helper).
- For manual recovery or during incident response you can trigger the reset yourself:

```bash
node examples/reset-encryption.js
```

### File Permissions

Automatically sets restrictive permissions on token files:
- **SQLite database**: `0600` (owner read/write only)
- **JSON files**: `0600` (owner read/write only)

---

## 🌐 Environment Support

### Production vs Sandbox

```bash
# Production (default)
EBAY_ENVIRONMENT=PRODUCTION

# Sandbox
EBAY_ENVIRONMENT=SANDBOX
```

The library automatically uses appropriate API endpoints:
- **Production**: `https://api.ebay.com/identity/v1/oauth2/token`
- **Sandbox**: `https://api.sandbox.ebay.com/identity/v1/oauth2/token`

---

## 🔄 Token Lifecycle Management

### Refresh Token Requirements

⚠️ **Important**: Refresh tokens cannot be generated programmatically and must be obtained through manual browser-based OAuth flow.

### Automatic Features

- **Token Refresh**: Automatically refreshes expired access tokens
- **Conflict Resolution**: SSOT prevents multiple instances from conflicting
- **Error Recovery**: Automatic invalid_grant recovery using latest tokens
- **Cache Management**: Intelligent cache invalidation and updates

### Manual Refresh Token Setup

1. Use eBay's OAuth flow in browser to get refresh token
2. Set via environment variable or API:

```bash
# Via environment
EBAY_INITIAL_REFRESH_TOKEN=your_refresh_token

# Via API
await manager.setRefreshToken('your_refresh_token', 'account_name');
```

---

## 🛠️ Advanced Configuration

### Database Configuration

```javascript
const manager = new UserAccessToken_AuthorizationCodeManager({
  databasePath: './custom/path/tokens.sqlite'
});
```

### File Storage Configuration

```javascript
const manager = new UserAccessToken_AuthorizationCodeManager({
  tokenFilePath: './custom/tokens.json',  // Local JSON storage
  masterKey: 'your_encryption_key'
});
```

### SSOT Configuration

```javascript
const manager = new UserAccessToken_AuthorizationCodeManager({
  ssotJsonPath: '/shared/secure/tokens.json',  // Centralized storage
  tokenNamespace: 'production-app',           // Namespace for isolation
  masterKey: 'your_shared_encryption_key'     // Shared across instances
});
```

---

## 📊 Performance Optimization

### Memory Caching

```javascript
// Automatic memory caching with TTL
const token = await manager.getUserAccessTokenByAppId('app_id');
// Subsequent calls within expiry are served from memory (~1ms)
```

### Batch Operations

```javascript
// Multiple token requests are optimized
const [token1, token2, token3] = await Promise.all([
  manager.getUserAccessTokenByAppId('app1'),
  manager.getUserAccessTokenByAppId('app2'),
  manager.getUserAccessTokenByAppId('app3')
]);
```

---

## 🔍 Monitoring & Debugging

### Logging

The library provides comprehensive logging:

```javascript
// Success operations
✅ Access token refreshed successfully for App ID abc123 (user@example.com)
🔄 Auto-saved to encrypted JSON for app: abc123
🌟 Centralized token provider (SSOT) enabled for multi-package coordination

// Error conditions
🚨 Failed to refresh access token for App ID abc123: invalid_grant
⚠️ Invalid grant detected for App ID abc123, attempting recovery from SSOT...
🔄 Retrying refresh with latest token from SSOT (version: 5)
```

### Error Handling

```javascript
try {
  const token = await manager.getUserAccessTokenByAppId('app_id');
} catch (error) {
  if (error.message.includes('invalid_grant')) {
    // Handle expired refresh token
    console.log('Refresh token expired, manual refresh required');
  } else if (error.message.includes('No token found')) {
    // Handle missing token
    console.log('No token found, initial setup required');
  }
}
```

---

## 🧪 Testing

Run the test suite:

```bash
npm test
npm run lint
```

### Test Coverage

- ✅ Token encryption/decryption
- ✅ Multi-layer caching
- ✅ SSOT coordination and locking
- ✅ Automatic refresh and recovery
- ✅ Database operations
- ✅ File I/O with proper permissions

---

## 🔧 Troubleshooting

### Common Issues

#### "No token found for App ID"
```javascript
// Solution: Set initial refresh token
await manager.setRefreshToken('your_refresh_token', 'account_name');
```

#### "invalid_grant" errors
```javascript
// With SSOT enabled, automatic recovery is attempted
// Without SSOT, manual refresh token update required
```

#### Permission denied on token files
```bash
# Ensure proper file permissions
chmod 600 ./database/ebay_tokens.sqlite
# Example (Linux): adjust the JSON cache path for your OS
chmod 600 ~/.local/share/ebay-oauth-tokens/ebay-tokens.encrypted.json
```

#### SSOT coordination issues
```javascript
// Ensure all instances use same masterKey and ssotJsonPath
const config = {
  masterKey: process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY,  // Optional override shared across instances
  ssotJsonPath: '/shared/tokens.json'      // Shared location
};
```

---

## 📋 Requirements

- **Node.js**: ≥16.0.0
- **Dependencies**: `axios`, `dotenv`
- **Peer dependencies** (install in your app): `sqlite`, `sqlite3`
- **File System**: Write permissions for token storage
- **Network**: HTTPS access to eBay APIs

---

## 📖 Related Documentation

- [eBay Developer Program](https://developer.ebay.com/)
- [eBay OAuth 2.0 Documentation](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- [eBay API Scopes](https://developer.ebay.com/api-docs/static/oauth-scopes.html)

---

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. **Security**: No credentials or sensitive data in commits
2. **Testing**: Add tests for new features
3. **Documentation**: Update README for API changes
4. **Lint**: Run `npm run lint` before submitting

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 📞 Support

For issues and questions:

- **GitHub Issues**: [Report bugs or request features](https://github.com/Naosan/ebay-oauth-token-manager/issues)
- **eBay Developer Support**: For eBay API-specific questions
- **Security Issues**: Please report privately to maintain security

---

*Built with ❤️ for the eBay developer community*
