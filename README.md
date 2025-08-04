# eBay OAuth Token Manager

A comprehensive Node.js library for managing eBay OAuth 2.0 tokens with multiple storage strategies, encryption, and automatic refresh capabilities.

## 🚀 Features

- **🔄 Automatic Dual Storage**: Automatic SQLite database + encrypted JSON file storage (no configuration required)
- **⚡ Performance Optimized**: Memory cache → JSON file → Database → eBay API priority for maximum speed
- **🔄 Automatic Token Refresh**: Handles token expiration and refresh automatically
- **🔐 AES-256-GCM Encryption**: Secure token storage with authenticated encryption
- **💾 Memory Caching**: High-performance in-memory caching for frequently accessed tokens
- **🔀 Multiple OAuth Flows**: Support for both Client Credentials and Authorization Code flows
- **🌐 Cross-platform**: Works on Windows, macOS, and Linux
- **📘 TypeScript Ready**: Includes type definitions
- **🚫 Zero Configuration**: No environment variables needed - automatic dual storage enabled by default

## 📦 Installation

```bash
npm install ebay-oauth-token-manager
```

## 🔧 Quick Start

### 1. Environment Setup

Create a `.env` file in your project root:

```env
# Required: eBay API Credentials
EBAY_CLIENT_ID=your_ebay_client_id
EBAY_CLIENT_SECRET=your_ebay_client_secret

# Optional: Configuration
EBAY_MASTER_KEY=your_secure_master_key_change_me
EBAY_ENVIRONMENT=PRODUCTION
```

### 2. Basic Usage (Zero Configuration!)

```javascript
import { getBrowseApiToken, getTradingApiToken, getTaxonomyApiToken } from 'ebay-oauth-token-manager';

// Get Application Access Token for Browse API (public data)
const browseToken = await getBrowseApiToken();

// Get Application Access Token for Taxonomy API (category data)
const taxonomyToken = await getTaxonomyApiToken();

// Get User Access Token for Trading API (private operations)
// ✨ Automatic dual storage: Database + JSON file (no setup required!)  
const tradingToken = await getTradingApiToken(); // App ID is optional
```

**🎯 What happens automatically:**
1. **Memory Cache** check (fastest)
2. **JSON File** check (fast)  
3. **SQLite Database** check (reliable)
4. **eBay API** refresh (if needed)
5. **Auto-save** to both storage methods

### 3. Direct Class Usage

```javascript
import { UserAccessToken_AuthorizationCodeManager } from 'ebay-oauth-token-manager';

const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'your_ebay_client_id',
  clientSecret: 'your_ebay_client_secret',
  masterKey: 'your_secure_master_key'
  // ✨ No need to specify storage mode - dual storage is automatic!
});

const token = await tokenManager.getUserAccessTokenByAppId('your-app-id');
```

## 🏗️ Configuration Options

### ✨ Automatic Dual Storage (Default - Recommended)

```javascript
import { UserAccessToken_AuthorizationCodeManager } from 'ebay-oauth-token-manager';

const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'your_ebay_client_id',
  clientSecret: 'your_ebay_client_secret',
  masterKey: 'your_secure_master_key'
  // 🎯 Automatic dual storage enabled by default:
  // - SQLite database: './database/ebay_tokens.sqlite'
  // - Encrypted JSON: Platform-specific secure location
  // - Memory cache: High-performance temporary storage
});
```

### Custom Paths (Optional)

```javascript
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'your_ebay_client_id',
  clientSecret: 'your_ebay_client_secret',
  masterKey: 'your_secure_master_key',
  databasePath: './custom/path/ebay_tokens.sqlite',
  tokenFilePath: './custom/path/ebay-tokens.encrypted.json'
});
```

### File-Only Storage (Legacy)

```javascript
import { LocalSharedTokenManager } from 'ebay-oauth-token-manager';

const tokenManager = new LocalSharedTokenManager({
  masterKey: 'your_secure_master_key',
  tokenFilePath: './tokens/ebay-tokens.encrypted.json'
});
```

## ⚡ Performance & Priority System

The library automatically optimizes token retrieval with a smart priority system:

```
📊 Token Retrieval Priority:
1. 🧠 Memory Cache     → ~1ms     (fastest)
2. 📁 JSON File        → ~10ms    (fast)  
3. 🗄️ SQLite Database  → ~50ms    (reliable)
4. 🌐 eBay API Refresh → ~500ms   (fallback)
```

**Benefits:**
- **🚀 Sub-millisecond access** for frequently used tokens (memory cache)
- **📁 Fast file access** for JSON storage (10x faster than database)
- **🔄 Automatic redundancy** - if one storage fails, others provide backup
- **💾 Persistent storage** - tokens survive application restarts

## 🔐 Security Best Practices

### 1. Environment Variables

**Never hardcode credentials in your source code.** Always use environment variables:

```javascript
// ❌ NEVER do this
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'hardcoded_client_id',
  clientSecret: 'hardcoded_secret'
});

// ✅ Always do this
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: process.env.EBAY_CLIENT_ID,
  clientSecret: process.env.EBAY_CLIENT_SECRET,
  masterKey: process.env.EBAY_MASTER_KEY
});
```

### 2. Master Key Security

- **Use a strong, unique master key** for each environment
- **Never commit master keys** to version control
- **Rotate keys regularly** in production environments
- **Use different keys** for development, staging, and production

```bash
# Generate a secure master key
openssl rand -hex 32
```

### 3. File Permissions

Ensure token storage directories have appropriate permissions:

```bash
# Linux/macOS
chmod 700 ./database/
chmod 600 ./database/*.sqlite

# Windows (PowerShell)
icacls "./database" /grant:r "$env:USERNAME:(OI)(CI)F" /inheritance:r
```

## 📚 API Reference

### Core Functions

#### `getBrowseApiToken(options?)`

Get Application Access Token for eBay Browse API (public data access).

```javascript
const token = await getBrowseApiToken({
  clientId: 'custom_client_id',
  clientSecret: 'custom_secret'
});
```

#### `getTaxonomyApiToken(options?)`

Get Application Access Token for eBay Taxonomy API (category and classification data).

```javascript
const token = await getTaxonomyApiToken({
  clientId: 'custom_client_id',
  clientSecret: 'custom_secret',
  scope: 'https://api.ebay.com/oauth/api_scope'
});
```

#### `getTradingApiToken(appId?, options?)`

Get User Access Token for eBay Trading API (private operations).

```javascript
// App ID is optional - uses EBAY_CLIENT_ID if not provided
const token = await getTradingApiToken('your-app-id', {
  clientId: 'custom_client_id',
  clientSecret: 'custom_secret'
});

// Or use without App ID
const token = await getTradingApiToken();
```

### Classes

#### `UserAccessToken_AuthorizationCodeManager`

Manages User Access Tokens with SQLite database storage.

**Constructor Options:**
- `clientId` (required): eBay Client ID
- `clientSecret` (required): eBay Client Secret
- `masterKey` (required): Encryption master key
- `databasePath`: SQLite database file path
- `defaultAppId`: Default eBay App ID
- `encryptionEnabled`: Enable/disable encryption (default: true)

**Methods:**
- `getUserAccessTokenByAppId(appId)`: Get token by App ID
- `getUserAccessToken(accountName)`: Get token by account name
- `saveUserAccessToken(accountName, tokenData)`: Save token data
- `checkRefreshTokenValidity()`: Check if refresh token is valid

#### `LocalSharedTokenManager`

Manages tokens with encrypted file storage.

**Constructor Options:**
- `masterKey` (required): Encryption master key
- `tokenFilePath`: Token file path (default: OS-specific)

**Methods:**
- `getToken(appId)`: Get token by App ID
- `saveToken(appId, tokenData)`: Save token data
- `checkRefreshTokenValidity()`: Check if refresh token is valid

#### `ApplicationAccessToken_ClientCredentialsManager`

Manages Application Access Tokens for Browse API.

**Constructor Options:**
- `clientId` (required): eBay Client ID
- `clientSecret` (required): eBay Client Secret
- `scope`: OAuth scope (default: basic API access)

**Methods:**
- `getApplicationAccessToken()`: Get Application Access Token

## 🌍 Cross-Project Token Sharing

This library supports sharing tokens across multiple applications:

### 1. File-Based Sharing (Recommended)

```javascript
// Project A
const tokenManager = new LocalSharedTokenManager({
  masterKey: 'shared_master_key_across_projects',
  tokenFilePath: '/shared/location/ebay-tokens.encrypted.json'
});

// Project B (different application)
const tokenManager = new LocalSharedTokenManager({
  masterKey: 'shared_master_key_across_projects', // Same key
  tokenFilePath: '/shared/location/ebay-tokens.encrypted.json' // Same file
});
```

### 2. Environment-Based Configuration

```bash
# Shared across all projects
EBAY_MASTER_KEY=shared_secure_key_for_all_projects
EBAY_TOKEN_FILE_PATH=/shared/location/ebay-tokens.encrypted.json
```

## 🔧 Advanced Configuration

### Custom Token Storage Location

```javascript
// Windows
const tokenManager = new LocalSharedTokenManager({
  masterKey: process.env.EBAY_MASTER_KEY,
  tokenFilePath: 'C:\\ProgramData\\YourApp\\tokens\\ebay-tokens.encrypted.json'
});

// Linux/macOS
const tokenManager = new LocalSharedTokenManager({
  masterKey: process.env.EBAY_MASTER_KEY,
  tokenFilePath: '/var/lib/yourapp/tokens/ebay-tokens.encrypted.json'
});
```

### Custom Database Schema

```javascript
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: process.env.EBAY_CLIENT_ID,
  clientSecret: process.env.EBAY_CLIENT_SECRET,
  masterKey: process.env.EBAY_MASTER_KEY,
  databasePath: './custom/path/tokens.db'
});
```

## 🐛 Troubleshooting

### Common Issues

#### 1. "masterKey is required" Error

**Solution:** Set the `EBAY_MASTER_KEY` environment variable or pass it as an option:

```javascript
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  // ... other options
  masterKey: 'your_secure_master_key'
});
```

#### 2. "No token found" Error

**Solution:** Ensure you have valid tokens stored. For User Access Tokens, you need to obtain them through eBay's OAuth flow first.

#### 3. Database Lock Issues

**Solution:** The library handles SQLite WAL mode automatically. If you encounter lock issues:

```javascript
// Check if another process is using the database
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  // ... options
  databasePath: './different/path/tokens.db' // Use different database
});
```

#### 4. Token Refresh Failures

**Solution:** Check your eBay API credentials and refresh token validity:

```javascript
const isValid = await tokenManager.checkRefreshTokenValidity();
if (!isValid) {
  console.log('Refresh token expired, need to re-authenticate');
  // Re-run eBay OAuth flow
}
```

### Debug Mode

Enable debug logging:

```javascript
// Set environment variable
process.env.DEBUG = 'ebay-oauth-token-manager:*';

// Or enable console logging in your application
console.log('🔍 Token manager debug info:', {
  clientId: tokenManager.clientId?.substring(0, 10) + '...',
  databasePath: tokenManager.dbPath,
  encryptionEnabled: tokenManager.encryptionEnabled
});
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/ebay-oauth-token-manager/issues)
- **Documentation**: [GitHub Wiki](https://github.com/your-org/ebay-oauth-token-manager/wiki)
- **eBay Developer Program**: [developer.ebay.com](https://developer.ebay.com)

## 🚨 eBay OAuth Token Generation Limitations

### **IMPORTANT: Refresh Token Cannot Be Generated via API**

**eBay OAuth Specification:**
- **Refresh tokens CANNOT be generated through API calls**
- **Manual browser-based authentication flow is REQUIRED for initial token generation**
- **Only access tokens can be refreshed using existing refresh tokens**

**Impact on Development:**
1. **Initial Setup**: Requires manual eBay OAuth consent flow through browser
2. **Token Management**: This library can only refresh existing tokens, not create new ones
3. **Production Deployment**: Valid refresh tokens must be obtained before deployment

**Typical Workflow:**
```javascript
// Step 1: Manual browser authentication (one-time setup)
// Visit eBay OAuth consent URL and obtain initial tokens

// Step 2: Use this library for automatic token management
const token = await getTradingApiToken(); // Refreshes automatically if needed
```

**Note**: This is an eBay API limitation, not a library limitation.

## 🔗 Related Projects

- [eBay SDK for Node.js](https://github.com/ebay/ebay-nodejs-sdk)
- [eBay API Documentation](https://developer.ebay.com/api-docs/)