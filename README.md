# eBay OAuth Token Manager

**A comprehensive Node.js library for managing eBay OAuth 2.0 tokens with enterprise-grade features**

[![npm version](https://badge.fury.io/js/@naosan/ebay-oauth-token-manager.svg)](https://www.npmjs.com/package/@naosan/ebay-oauth-token-manager)
[![Node.js Compatible](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## ✨ Overview

This library provides robust OAuth 2.0 token management for eBay APIs with sophisticated multi-layered caching, encryption, and distributed coordination. Designed for production environments requiring high performance and security.

### 🎯 Key Benefits

- **Zero Configuration**: Works out-of-the-box with automatic dual storage
- **Cross-Platform Support**: Works seamlessly on Windows, macOS, and Linux
- **Production Ready**: Battle-tested multi-layer caching and error recovery
- **Enterprise Security**: AES-256-GCM encryption with machine-specific keys
- **Multi-Instance Coordination**: SSOT (Single Source of Truth) prevents token conflicts
- **API-Specific Optimization**: Dedicated managers for Trading API vs Browse API

---

## 🚀 Quick Start

### Installation

```bash
npm install @naosan/ebay-oauth-token-manager
```

### Basic Usage

```javascript
import { getTradingApiToken, getBrowseApiToken } from '@naosan/ebay-oauth-token-manager';

// For Trading API (User Access Tokens)
const tradingToken = await getTradingApiToken('your-app-id');

// For Browse API (Application Access Tokens)  
const browseToken = await getBrowseApiToken();
```

### Environment Setup

1. Copy `.env.example` to `.env` and fill in your credentials.
2. Start with the minimal variables below, then opt into advanced options as your deployment requires.

| Type | Keys | Notes |
| --- | --- | --- |
| **Required** | `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | Needed for every token request. |
| **Security (recommended)** | `EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY` | Ensures encrypted local storage can be decrypted across restarts/hosts. |
| **Default refresh token** | `EBAY_INITIAL_REFRESH_TOKEN` | Seeds only the `default` account for `EBAY_DEFAULT_APP_ID` the first time the manager runs. |
| **Coordination** | `OAUTH_SSOT_JSON`, `TOKEN_NAMESPACE` | Optional SSOT JSON file that keeps multi-instance deployments in sync. |
| **Environment** | `EBAY_ENVIRONMENT` | Choose `PRODUCTION` or `SANDBOX` (defaults to production). |

```bash
# Minimal example
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret
EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=generate_a_secure_key
```

> **Note:** `EBAY_INITIAL_REFRESH_TOKEN` does **not** update every account automatically. It seeds only the default account/App ID combination. Use the helper script or call `setRefreshToken` for any additional pairs.

### Bulk seeding refresh tokens

Detailed instructions for the `examples/bulk-refresh-token-seed.js` helper now live in [`docs/bulk-refresh-token-seeding.md`](docs/bulk-refresh-token-seeding.md) to minimize README merge conflicts. The guide covers preparing JSON seed data, running the script, and interpreting the results.

### Bulk seeding refresh tokens for multiple accounts

When you need to preload refresh tokens for several account/app ID pairs, use the helper script in `examples/bulk-refresh-token-seed.js`. The script reads a list of refresh tokens and calls `setRefreshToken` for each entry, ensuring every account is initialized.

1. Describe the tokens either inline or via file:
   - **Inline JSON** (set in `.env`):
     ```bash
     EBAY_REFRESH_TOKEN_SEED_JSON='[
       {"accountName": "sellerA", "appId": "YourAppIDA", "refreshToken": "v=1.abcdef"},
       {"accountName": "sellerB", "appId": "YourAppIDB", "refreshToken": "v=1.uvwxyz"}
     ]'
     ```
   - **JSON file** (relative to the project root or absolute path):
     ```bash
     EBAY_REFRESH_TOKEN_SEED_FILE=config/refresh-token-seed.json
     ```
     ```json
     [
       { "accountName": "sellerA", "appId": "YourAppIDA", "refreshToken": "v=1.abcdef" },
       { "accountName": "sellerB", "appId": "YourAppIDB", "refreshToken": "v=1.uvwxyz" }
     ]
     ```

2. Run the bulk seeding script after your environment variables are loaded:
   ```bash
   node examples/bulk-refresh-token-seed.js
   ```

The script reports which tokens were stored successfully and highlights any entries that need attention.

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
import { UserAccessToken_AuthorizationCodeManager } from '@naosan/ebay-oauth-token-manager';

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

### Browse API (Application Access Tokens)

For public data access:

```javascript
import { ApplicationAccessToken_ClientCredentialsManager } from '@naosan/ebay-oauth-token-manager';

const manager = new ApplicationAccessToken_ClientCredentialsManager({
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret'
});

// Get application token (auto-refresh if expired)
const token = await manager.getApplicationAccessToken();
```

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

---

## 💾 Token Storage Details

### Storage Locations

The library automatically creates storage directories and manages token persistence across multiple locations:

#### 1. SQLite Database (Primary Storage)
**Location**: `./database/ebay_tokens.sqlite` (configurable)
**Contains**:
- `access_token` - Encrypted access tokens (AES-256-CBC)
- `refresh_token` - Encrypted refresh tokens (AES-256-CBC) 
- `account_name` - eBay account identifier (unique key)
- `app_id` - eBay application ID
- `expires_in` - Token expiration time (seconds)
- Token metadata and timestamps

#### 2. Encrypted JSON File (Dual Storage)
**Windows**: `%PROGRAMDATA%\ebay-oauth-tokens\ebay-tokens.encrypted.json`
**Linux/Mac**: `$HOME/ebay-oauth-tokens/ebay-tokens.encrypted.json`
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
| **User Access Token** | Database + JSON | AES-256-CBC/GCM | ~2 hours | Trading API access |
| **User Refresh Token** | Database + JSON + SSOT | AES-256-CBC/GCM | ~18 months | Token renewal |
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

### AES-256-GCM Encryption

All tokens are encrypted using industry-standard AES-256-GCM with:
- **Machine-specific keys**: Derived from master key + machine ID
- **Authenticated encryption**: Prevents tampering
- **Unique initialization vectors**: Each encryption is unique

### Secure Key Management

```javascript
// Environment variable (recommended)
EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY=your_256_bit_secure_key

// Or via configuration
const manager = new UserAccessToken_AuthorizationCodeManager({
  masterKey: process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY
});
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
chmod 600 ./tokens/ebay_tokens.json
```

#### SSOT coordination issues
```javascript
// Ensure all instances use same masterKey and ssotJsonPath
const config = {
  masterKey: process.env.EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY,  // Same across instances
  ssotJsonPath: '/shared/tokens.json'      // Shared location
};
```

---

## 📋 Requirements

- **Node.js**: ≥18.0.0
- **Dependencies**: `axios`, `sqlite3`, `dotenv`
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

- **GitHub Issues**: [Report bugs or request features](https://github.com/your-repo/issues)
- **eBay Developer Support**: For eBay API-specific questions
- **Security Issues**: Please report privately to maintain security

---

*Built with ❤️ for the eBay developer community*