# e-auth-manager

**A comprehensive Node.js library for managing OAuth 2.0 tokens with enterprise-grade features (provider-agnostic)**
[![Node.js Compatible](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Note: Historical environment variable names (`EBAY_*`) are retained for compatibility but do not imply eBay-only usage.

---

## 笨ｨ Overview

This library provides robust OAuth 2.0 token management for modern REST APIs with sophisticated multi-layered caching, encryption, and distributed coordination. Designed for production environments requiring high performance and security.

### 識 Key Benefits

- **Zero Configuration**: Works out-of-the-box with automatic dual storage
- **Cross-Platform Support**: Works seamlessly on Windows, macOS, and Linux
- **Production Ready**: Battle-tested multi-layer caching and error recovery
- **Enterprise Security**: AES-256 encryption with a master key (default: hostname; set `EAUTH_MASTER_KEY` to share across hosts)
- **Multi-Instance Coordination**: SSOT (Single Source of Truth) prevents token conflicts
- **API-Specific Optimization**: Dedicated managers for Trading API vs Browse API

---

## 噫 Quick Start

### Installation

```bash
npm install @naosan/e-auth-manager
```

### Basic Usage (single-account)

```javascript
import {
  getTradingApiToken,
  getBrowseApiToken,
  getMarketingApiToken
} from '@naosan/e-auth-manager';

// User-scoped APIs (User Access Tokens)
const tradingToken = await getTradingApiToken();   // defaults to the single configured account

// Public APIs (Application Access Tokens)
const browseToken = await getBrowseApiToken();

// Marketing-like APIs (User Access Tokens)
const marketingToken = await getMarketingApiToken();
```

Importing `@naosan/e-auth-manager` is safe: it does not validate env vars or touch DB/files on import. Configuration is loaded lazily when you call exported helper functions or instantiate managers.

### Storage defaults (important, single-account)

- Primary storage: SQLite `./database/ebay_tokens.sqlite` (relative to current working directory; override with `EBAY_DATABASE_PATH` / `EAUTH_DATABASE_PATH`).
- Secondary (cache/backup): encrypted JSON at the OS-specific default (Linux: `~/.local/share/ebay-oauth-tokens/ebay-tokens.encrypted.json`). Override with `EBAY_TOKEN_FILE_PATH` / `EAUTH_TOKEN_FILE_PATH`.
- There is **no** default `../database/ebay_tokens.json`; if you see that path in logs or docs, it is not used by this package.
- JSON files that happen to be in the repo/workspace (e.g., under `database/`) are **not** read unless you explicitly point `EBAY_TOKEN_FILE_PATH` / `EAUTH_TOKEN_FILE_PATH` to them.
- This package is intended for a **single account** by default. Set `EAUTH_ACCOUNT_NAME` (alias: `EBAY_ACCOUNT_NAME`) to change the default `account_name` used for initial seeding and legacy account-name APIs.
- SQLite uses rollback-journal by default (no `-wal/-shm` files). Opt-in to WAL with `EAUTH_SQLITE_WAL=1` if you need it.

### Choosing the Right Token

Use the appropriate token type based on the API family and whether user consent is required:

- Application Access Token (Client Credentials)
  - When: Public data, no user context
  - APIs: Catalog, Search, and other read-only endpoints
  - How: `getBrowseApiToken()` (app token helper)
  - Requirements: `EAUTH_CLIENT_ID`, `EAUTH_CLIENT_SECRET` (aliases: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`; no refresh token needed)

- User Access Token (IAF; Authorization Code)
  - When: User account窶都coped operations that require consent
  - APIs: Trading, Sell Metadata, Marketing (e.g., promotions & campaigns)
  - How: `getTradingApiToken()`, `getSellMetadataApiToken()`, `getMarketingApiToken()`
  - Requirements: Initial refresh token (via manual OAuth). Seed with `EAUTH_INITIAL_REFRESH_TOKEN` (alias: `EBAY_INITIAL_REFRESH_TOKEN`, deprecated) or call `setRefreshToken()`

### Environment Setup

1. Copy `.env.example` to `.env` in your app project root and fill in your credentials. The library loads `.env` from the current working directory first, then falls back to the package root without overriding already-set values. Prefer `EAUTH_*` names; `EBAY_*` and `EBAY_API_*` are accepted for compatibility.
2. (Optional) Provide a JSON config file and point `EAUTH_CONFIG` (or `EAUTH_CONFIG_FILE`) to it; it can hold clientId/secret, masterKey, paths, and more. Env vars override the config file.
3. Start with the minimal variables below, then opt into advanced options as your deployment requires.

| Type | Keys | Notes |
| --- | --- | --- |
| **Required** | `EAUTH_CLIENT_ID`, `EAUTH_CLIENT_SECRET` (aliases: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_API_APP_NAME`, `EBAY_API_CERT_NAME`) | Needed for every token request. |
| **Security (optional)** | `EAUTH_MASTER_KEY` (legacy alias: `EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY`, deprecated) | Overrides the per-machine default (hostname). Needed only when sharing encrypted tokens across hosts. |
| **Legacy migration (optional)** | `EAUTH_MACHINE_ID` | Only needed to decrypt/migrate legacy encrypted JSON token files written by very old versions that derived the file key from `masterKey + COMPUTERNAME/HOSTNAME`. |
| **Default refresh token** | `EAUTH_INITIAL_REFRESH_TOKEN` (legacy alias: `EBAY_INITIAL_REFRESH_TOKEN`, deprecated) | Seeds the single `default` account for the configured `defaultAppId` (by default this is `EAUTH_CLIENT_ID`) the first time the manager runs. |
| **Seeding mode** | `EAUTH_INITIAL_REFRESH_TOKEN_MODE` | `auto` (default): seed only on missing/expired. `sync`: overwrite when different (dangerous; use only if env is SSOT). |
| **Safety toggles** | `EAUTH_PURGE_ON_KEY_CHANGE`, `EAUTH_TOKEN_FILE_RECOVERY_MODE` | Opt-in destructive recovery actions (key mismatch purge, token-file backup/reset). |
| **Coordination** | `EAUTH_SSOT_JSON` (alias: `OAUTH_SSOT_JSON`), `EAUTH_TOKEN_NAMESPACE` (alias: `TOKEN_NAMESPACE`) | Optional SSOT JSON file that keeps multi-instance deployments in sync. |
| **Environment** | `EAUTH_ENVIRONMENT` (alias: `EBAY_ENVIRONMENT`) | Choose `PRODUCTION` or `SANDBOX` (defaults to production). |
| **Config file** | `EAUTH_CONFIG` (alias: `EAUTH_CONFIG_FILE`) | Optional JSON config file with clientId/secret, masterKey, paths, etc. Env vars still override it. |

If you don't provide a master key, the library automatically falls back to the current
machine's hostname. Tokens encrypted with the default key can be decrypted across
restarts on that same host, but they cannot be shared across different machines without
specifying a custom key. This also applies to SSOT coordination—set
`EAUTH_MASTER_KEY` (legacy alias: `EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY`, deprecated) whenever `EAUTH_SSOT_JSON`
or `OAUTH_SSOT_JSON` is used so every instance can decrypt the shared file.

```bash
# Minimal example
EAUTH_CLIENT_ID=your_ebay_client_id
EAUTH_CLIENT_SECRET=your_ebay_client_secret

# Optional: override the per-machine default encryption key (hostname fallback is automatic)
EAUTH_MASTER_KEY=generate_a_secure_key
# EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=generate_a_secure_key  # deprecated
```

> **Note:** Seeding is single-account. `EAUTH_INITIAL_REFRESH_TOKEN` (legacy alias `EBAY_INITIAL_REFRESH_TOKEN` is deprecated) seeds only the configured default account name (`EAUTH_ACCOUNT_NAME` / `EBAY_ACCOUNT_NAME`, default: `default`) and `defaultAppId`.

### Common pitfalls when using from another repo

- Always set `EBAY_DATABASE_PATH` (or `EAUTH_DATABASE_PATH`) to an **absolute path**; relative paths may point to an empty DB when the working directory differs. If multiple apps/services should share the same tokens, point them all at the same absolute DB path.
- `appId` / `defaultAppId` must match the `app_id` stored in the DB, otherwise it is treated as missing.
- Single-account by default: all operations target the configured default account name (`EAUTH_ACCOUNT_NAME` / `EBAY_ACCOUNT_NAME`, default: `default`).
- If you share encrypted JSON across hosts, set both `EAUTH_TOKEN_FILE_PATH` and `EAUTH_MASTER_KEY` (legacy aliases still work). If the key mismatches, the JSON cache is unreadable and will be ignored (or set `EAUTH_TOKEN_FILE_RECOVERY_MODE=backup-and-reset` to opt into backup+reset).
- Ensure write permission to the DB file and the token file path; permission errors cause silent fallback.
- Provide an initial refresh token (`EAUTH_INITIAL_REFRESH_TOKEN`; legacy alias `EBAY_INITIAL_REFRESH_TOKEN` is deprecated) when the DB is empty.
- Confirm `EAUTH_ENVIRONMENT` / `EBAY_ENVIRONMENT` (PRODUCTION vs SANDBOX) matches your keys.

### Database schema

SQLite DB is created automatically (WAL is opt-in via `EAUTH_SQLITE_WAL=1`). Main table and metadata:

- `ebay_oauth_tokens`
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `name TEXT NOT NULL DEFAULT 'oauth'`
  - `account_name TEXT NOT NULL UNIQUE`
  - `app_id TEXT`
  - `access_token TEXT NOT NULL`
  - `refresh_token TEXT NOT NULL`
  - `access_token_updated_date TEXT NOT NULL`
  - `expires_in INTEGER NOT NULL`
  - `refresh_token_updated_date TEXT NOT NULL`
  - `refresh_token_expires_in INTEGER NOT NULL DEFAULT 47304000`
  - `token_type TEXT DEFAULT 'Bearer'`
  - `created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
  - `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`
  - Index: `idx_ebay_oauth_tokens_app_id (app_id)`

- `oauth_metadata`
  - `key TEXT PRIMARY KEY`
  - `value TEXT`
  - `updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`

### Bulk seeding refresh tokens

Detailed instructions for the `examples/bulk-refresh-token-seed.js` helper now live in [`docs/bulk-refresh-token-seeding.md`](docs/bulk-refresh-token-seeding.md) to minimize README merge conflicts. The guide covers preparing JSON seed data, running the script, and interpreting the results.

<!-- Old, duplicated seeding details removed. See the dedicated doc instead. -->

---

## 女・・Architecture

### Multi-Layer Token Retrieval System

The library implements a sophisticated 5-layer retrieval system:

```
1. Memory Cache (~1ms)          竊・Fastest
2. JSON File Cache (~10ms)      
3. SQLite Database (~50ms)      
4. SSOT Provider (coordination) 
5. Remote API Endpoint (~500ms)           竊・Slowest (last resort)
```

### Core Components

| Component | Purpose | Token Types |
|-----------|---------|-------------|
| **UserAccessToken_AuthorizationCodeManager** | User-scoped tokens | User Access Tokens (18-month expiry) |
| **ApplicationAccessToken_ClientCredentialsManager** | App-only tokens | Application Access Tokens (2-hour expiry) |
| **FileJsonTokenProvider** | Multi-instance coordination | SSOT (Single Source of Truth) |
| **LocalSharedTokenManager** | Cross-project sharing | Encrypted JSON storage |

---

## 答 API Reference

### User-scoped APIs (User Access Tokens)

For private operations requiring user authorization:

```javascript
import { UserAccessToken_AuthorizationCodeManager } from '@naosan/e-auth-manager';

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
import { checkRefreshTokenValidity, getRefreshTokenHealth } from '@naosan/e-auth-manager';

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

- The check now mirrors the runtime retrieval order: **database 竊・encrypted JSON cache** (with both layers guarded by the same encryption key logic).
- If the SQLite store is empty but the shared encrypted JSON still holds a valid refresh token, the helper returns `true` so multi-project setups stay operational.
- `getRefreshTokenHealth(appId)` exposes the same decision tree with diagnostics, including the layer that produced the valid token (or why none were found). Possible `status` values are `valid`, `invalid`, `error`, `not_available`, and `not_attempted`.
- Use actual token retrieval (`getTradingApiToken(appId)` or similar) when you want to assert full API readiness窶杯hose calls already fall back in the same order and refresh automatically when needed.

### Public APIs (Application Access Tokens)

For public data access:

```javascript
import { ApplicationAccessToken_ClientCredentialsManager } from '@naosan/e-auth-manager';

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
import { getSellMetadataApiToken } from '@naosan/e-auth-manager';
const token = await getSellMetadataApiToken();
// Example endpoint:
// GET https://api.example.com/v1/resource
```

See `examples/sell-metadata-item-conditions.js` for a runnable script.

### Marketing-like APIs (User Access Tokens)

For promotions, ad campaigns, and merchandising workflows:

```javascript
import { getMarketingApiToken } from '@naosan/e-auth-manager';

const token = await getMarketingApiToken('your_app_id', {
  readOnly: false,    // Set true for sell.marketing.readonly scope
  forceRefresh: false // Set true to force refresh with Marketing scopes every call
});

// Example endpoint:
// GET https://api.example.com/v1/resource
```

> 笞・・莠句燕縺ｫ `sell.marketing` 縺ｾ縺溘・ `sell.marketing.readonly` 繧貞性繧繧ｹ繧ｳ繝ｼ繝励〒蜿門ｾ励＠縺溘Μ繝輔Ξ繝・す繝･繝医・繧ｯ繝ｳ縺悟ｿ・ｦ√〒縺吶・
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

#### 笞｡・・Quick SSOT refresh token updater

When you receive a new refresh token (for example, after rotating credentials), run the helper script below to push the value to the SQLite database, the encrypted JSON cache, and the SSOT file in one step.

1. Confirm your `.env` contains the core production credentials:
   ```env
   EAUTH_CLIENT_ID=your_production_client_id
   EAUTH_CLIENT_SECRET=your_production_client_secret
   EAUTH_MASTER_KEY=your_shared_master_key
   # Optional: SSOT location
   # For multi-instance sync, set an explicit path. The repository no longer tracks
   # config/refresh-ssot.json (gitignored). Point to a secure location instead:
   # EAUTH_SSOT_JSON=/secure/shared/refresh-ssot.json
   # OAUTH_SSOT_JSON=/secure/shared/refresh-ssot.json  (legacy alias)
   ```
2. Execute the updater with the fresh refresh token:
   ```bash
   node examples/update-ssot-refresh-token.js "v=1.abcdefg"
   ```
   You can also pass flags for custom paths:
   ```bash
   node examples/update-ssot-refresh-token.js \
     --refresh-token "v=1.abcdefg" \
     --ssot /secure/shared/refresh-ssot.json
   ```

The script increments the SSOT version when it writes the encrypted refresh token so that other instances immediately recognize the update.

> Security note: `config/refresh-ssot.json` is intentionally excluded from Git and should not be committed. If you want a local placeholder, copy `config/refresh-ssot.example.json` to `config/refresh-ssot.json` on your machine or set `OAUTH_SSOT_JSON` to a secure shared path.

#### ｪ・Dual storage refresh token seeder

Need to initialize both the SQLite database and the encrypted JSON cache (dual storage) with a refresh token? Use the companion seeding script to populate both locations in one command.

1. Provide your credentials and optional storage overrides via environment variables:
   ```env
   EAUTH_CLIENT_ID=your_production_client_id
   EAUTH_CLIENT_SECRET=your_production_client_secret
   EAUTH_MASTER_KEY=your_shared_master_key
   # Optional: override storage destinations (defaults match the library)
   # EAUTH_DATABASE_PATH=./database/ebay_tokens.sqlite
   # EAUTH_TOKEN_FILE_PATH=./config/ebay-tokens.encrypted.json
   ```
2. Run the seeder with the refresh token you received from your provider:
   ```bash
   node examples/seed-dual-storage-refresh-token.js "v=1.abcdefg"
   ```
   Or pass explicit flags when you have non-default paths:
   ```bash
   node examples/seed-dual-storage-refresh-token.js \
     --refresh-token "v=1.abcdefg" \
     --database ./database/ebay_tokens.sqlite \
     --tokens ./config/ebay-tokens.encrypted.json
   ```

The script saves tokens using the same encryption modes as the library: database fields are encrypted with AES-256-GCM, and the local JSON cache uses AES-256-CBC. This matches the default behaviour of `UserAccessToken_AuthorizationCodeManager`, making it easy to bootstrap new environments or recover from accidental file deletions.

---

## 沈 Token Storage Details

### Storage Locations

The library automatically creates storage directories and manages token persistence across multiple locations:

#### 1. SQLite Database (Primary Storage)
**Location**: `./database/ebay_tokens.sqlite` (configurable)
**Recommended (production / multi-repo)**: use an absolute path in an OS “app data” directory so `e-auth-manager` can share tokens safely across apps/services without CWD surprises:

- Linux: `~/.local/share/e-auth-manager/ebay_tokens.sqlite` (or `$XDG_DATA_HOME/e-auth-manager/ebay_tokens.sqlite`)
- macOS: `~/Library/Application Support/e-auth-manager/ebay_tokens.sqlite`
- Windows: `%LOCALAPPDATA%\\e-auth-manager\\ebay_tokens.sqlite` (fallback: `%APPDATA%`)
- Server/service installs: `/var/lib/e-auth-manager/ebay_tokens.sqlite` (or another locked-down directory you manage)

**Contains**:
- `access_token` - Encrypted access tokens (AES-256-GCM)
- `refresh_token` - Encrypted refresh tokens (AES-256-GCM) 
- `account_name` - account identifier (unique key)
- `app_id` - your application ID
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
- AES-256-CBC encryption with the configured master key (default: hostname; set `EAUTH_MASTER_KEY` to share across hosts)

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
  笏披楳笏 ebay_tokens.sqlite

// SSOT directory (if configured)
/custom/path/
  笏披楳笏 shared-tokens.json
  笏披楳笏 .locks/ (for process coordination)

// Legacy migration support (automatically detected)
// - Previous PROGRAMDATA location (Windows)
// - Original EStocks/tokens/ location (all platforms)
```

---

## 柏 Security Features

### Encryption Modes

- **Database (SQLite) fields**: AES-256-GCM (authenticated encryption)
- **Local JSON cache**: AES-256-CBC + HMAC-SHA256 (integrity-checked)
- **SSOT (central JSON)**: AES-256-GCM with AAD

All modes use the configured master key (default: hostname) and unique initialization vectors per encryption. Set `EAUTH_MASTER_KEY` to a shared secret to decrypt across hosts/containers.

### Secure Key Management

By default the library derives its encryption key from the current machine's hostname so tokens remain decryptable across
restarts on that host. Provide your own master key when you need a stable key that works across multiple machines or when you
plan to rotate keys explicitly.

```javascript
// Environment variable (optional, recommended for multi-host setups)
// Optional override; defaults to hostname-derived key when omitted
EAUTH_MASTER_KEY=your_256_bit_secure_key
// EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_256_bit_secure_key  // deprecated

// Or via configuration
const manager = new UserAccessToken_AuthorizationCodeManager({
  // Optional override; leave unset to use the per-machine default key
  masterKey: process.env.EAUTH_MASTER_KEY
});
```

### Legacy encrypted JSON migration (`EAUTH_MACHINE_ID`, `migrateTokenFile`)

Very old versions derived the encrypted JSON file key from `masterKey + machineId` (where `machineId` came from `COMPUTERNAME`/`HOSTNAME`), which breaks decryption when apps mix versions or when the file is moved across hosts. The current default KDF uses `masterKey` only.

- If you need to decrypt an old token file created on another host, set `EAUTH_MACHINE_ID` to the original `COMPUTERNAME`/`HOSTNAME` used when the file was written.
- The library does **not** auto-migrate the file format/KDF on read. To rewrite the token file using the current KDF, run an explicit migration:

```javascript
import LocalSharedTokenManager from '@naosan/e-auth-manager/file';

const manager = new LocalSharedTokenManager({
  // Optional; omit to use the OS-specific default path
  tokenFilePath: process.env.EAUTH_TOKEN_FILE_PATH,
  // Must match the key used when the file was created
  masterKey: process.env.EAUTH_MASTER_KEY
});

// Re-encrypt token file with masterKey-only KDF (recommended)
await manager.migrateTokenFile({ kdfVersion: 2 });
```

### Encryption Key Fingerprint & Key-Change Handling

- The manager stores a SHA-256 fingerprint of the derived encryption key inside the SQLite database (`oauth_metadata` table).
- On startup the fingerprint is compared to the current key. If they differ:
  - Default (safe): throws `EAUTH_ENCRYPTION_KEY_MISMATCH` and does **not** modify or purge existing tokens.
  - Opt-in (destructive): set `EAUTH_PURGE_ON_KEY_CHANGE=1` to purge tokens and reset caches.
- After rotating `EAUTH_MASTER_KEY`, re-seed refresh tokens (e.g., via `EAUTH_INITIAL_REFRESH_TOKEN`).
- For manual recovery or during incident response you can trigger a reset yourself:

```bash
node examples/reset-encryption.js
```

### Encrypted JSON cache recovery (opt-in)

- If the encrypted JSON cache is unreadable (wrong key / corruption), the library refuses to modify it by default and throws `EAUTH_TOKEN_FILE_UNREADABLE` (callers may still fall back to DB).
- To auto-backup and reset the file cache explicitly, set `EAUTH_TOKEN_FILE_RECOVERY_MODE=backup-and-reset`.

### File Permissions

Automatically sets restrictive permissions on token files:
- **SQLite database**: `0600` (owner read/write only)
- **JSON files**: `0600` (owner read/write only)

---

## 倹 Environment Support

### Production vs Sandbox

```bash
# Production (default)
EBAY_ENVIRONMENT=PRODUCTION

# Sandbox
EBAY_ENVIRONMENT=SANDBOX
```

The library automatically uses appropriate API endpoints:
- **Production**: `https://api.example.com/v1/resource`
- **Sandbox**: `https://api.sandbox.example.com/oauth2/token`

---

## 売 Token Lifecycle Management

### Refresh Token Requirements

笞・・**Important**: Refresh tokens cannot be generated programmatically and must be obtained through manual browser-based OAuth flow.

### Automatic Features

- **Token Refresh**: Automatically refreshes expired access tokens
- **Conflict Resolution**: SSOT prevents multiple instances from conflicting
- **Error Recovery**: Automatic invalid_grant recovery using latest tokens
- **Cache Management**: Intelligent cache invalidation and updates

### Manual Refresh Token Setup

1. Use your provider's OAuth flow in browser to get refresh token
2. Set via environment variable or API:

```bash
# Via environment
EAUTH_INITIAL_REFRESH_TOKEN=your_refresh_token
# EBAY_INITIAL_REFRESH_TOKEN=your_refresh_token  # deprecated

# Via API
await manager.setRefreshToken('your_refresh_token', 'account_name');
```

---

## 屏・・Advanced Configuration

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

## 投 Performance Optimization

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

## 剥 Monitoring & Debugging

### Logging

The library provides comprehensive logging:

```javascript
// Success operations
笨・Access token refreshed successfully for App ID abc123 (user@example.com)
売 Auto-saved to encrypted JSON for app: abc123
検 Centralized token provider (SSOT) enabled for multi-package coordination

// Error conditions
圷 Failed to refresh access token for App ID abc123: invalid_grant
笞・・Invalid grant detected for App ID abc123, attempting recovery from SSOT...
売 Retrying refresh with latest token from SSOT (version: 5)
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

## ｧｪ Testing

Run the test suite:

```bash
npm test
npm run lint
```

### Test Coverage

- 笨・Token encryption/decryption
- 笨・Multi-layer caching
- 笨・SSOT coordination and locking
- 笨・Automatic refresh and recovery
- 笨・Database operations
- 笨・File I/O with proper permissions

---

## 肌 Troubleshooting

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
  masterKey: process.env.EAUTH_MASTER_KEY,  // Optional override shared across instances
  ssotJsonPath: '/shared/tokens.json'      // Shared location
};
```

---

## 搭 Requirements

- **Node.js**: 竕･16.0.0
- **Dependencies**: `axios`, `dotenv`
- **Peer dependencies** (install in your app): `sqlite`, `sqlite3`
- **File System**: Write permissions for token storage
- **Network**: HTTPS access to your API endpoints

---

## 📖 Related Documentation`n`n- OAuth 2.0 (IETF RFC 6749)`n- OAuth 2.0 for Native Apps (BCP 212 / RFC 8252)`n- OAuth 2.0 for Browser-Based Apps (BCP 212)`n`n---

## ､・Contributing

Contributions are welcome! Please ensure:

1. **Security**: No credentials or sensitive data in commits
2. **Testing**: Add tests for new features
3. **Documentation**: Update README for API changes
4. **Lint**: Run `npm run lint` before submitting

---

## 塘 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 到 Support

For issues and questions:

- **GitHub Issues**: [Report bugs or request features](https://github.com/Naosan/e-auth-manager/issues)
- Developer Support: Contact your platform's support for API-specific questions
- **Security Issues**: Please report privately to maintain security

---

*Built for developers*
