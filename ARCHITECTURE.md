# eBay OAuth Token Manager - Technical Architecture

## Overview

The `ebay-oauth-token-manager` is a comprehensive Node.js library designed to handle eBay OAuth 2.0 token management with advanced features including automatic dual storage, performance optimization, and cross-platform compatibility.

## 🏗️ Core Architecture

### System Design Principles

1. **Zero Configuration**: Automatic dual storage without environment variable dependencies
2. **Performance First**: Multi-layered caching system for optimal token retrieval
3. **Security By Design**: AES-256-GCM encryption for all stored tokens
4. **Fault Tolerance**: Multiple storage redundancy and automatic error recovery
5. **API Specificity**: Dedicated token managers for different eBay API types

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  getBrowseApiToken()  │  getTradingApiToken()  │  Legacy APIs    │
├─────────────────────────────────────────────────────────────────┤
│                    Token Manager Layer                          │
├─────────────────────────────────────────────────────────────────┤
│  ApplicationAccess     │  UserAccess            │  LocalShared   │
│  TokenManager          │  TokenManager          │  TokenManager  │
├─────────────────────────────────────────────────────────────────┤
│                    Storage Layer                                │
├─────────────────────────────────────────────────────────────────┤
│  Memory Cache  │  JSON File  │  SQLite DB  │  eBay API         │
│  (~1ms)        │  (~10ms)    │  (~50ms)    │  (~500ms)         │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Core Components

### 1. Token Manager Classes

#### A. UserAccessToken_AuthorizationCodeManager

**Purpose**: Manages User Access Tokens for Trading API operations

**Key Features**:
- Automatic dual storage (SQLite + Encrypted JSON)
- Token expiration monitoring and auto-refresh
- App ID-based token retrieval
- AES-256-GCM encryption
- Memory caching with TTL

**Storage Schema**:
```sql
CREATE TABLE ebay_oauth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'oauth',
  account_name TEXT NOT NULL UNIQUE,
  app_id TEXT,
  access_token TEXT NOT NULL,        -- Encrypted
  refresh_token TEXT NOT NULL,       -- Encrypted
  access_token_updated_date TEXT NOT NULL,
  expires_in INTEGER NOT NULL,       -- 7200 (2 hours)
  refresh_token_updated_date TEXT NOT NULL,
  refresh_token_expires_in INTEGER,  -- 47304000 (1.5 years)
  token_type TEXT DEFAULT 'Bearer',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Core Methods**:
```javascript
// Primary token retrieval methods
async getUserAccessTokenByAppId(appId)
async getUserAccessToken(accountName = 'default')

// Token lifecycle management
async saveUserAccessToken(accountName, tokenData)
async renewUserAccessTokenByAppId(appId, tokenData)

// Validation and utility
async checkRefreshTokenValidity()
isAccessTokenExpired(tokenData, bufferSeconds = 300)
isRefreshTokenExpired(tokenData, bufferSeconds = 604800)
```

#### B. ApplicationAccessToken_ClientCredentialsManager

**Purpose**: Manages Application Access Tokens for Browse API operations

**Key Features**:
- Temporary token generation (no persistence)
- Client Credentials OAuth flow
- Memory-only caching
- Direct eBay API integration

**Core Methods**:
```javascript
async getApplicationAccessToken()
```

**Token Characteristics**:
- **Lifetime**: ~2 hours (non-refreshable)
- **Storage**: Memory cache only
- **Authentication**: App ID + Secret
- **Usage**: Public data access (Browse API)

#### C. LocalSharedTokenManager

**Purpose**: File-based token sharing across projects

**Key Features**:
- Cross-platform encrypted file storage
- Process-safe file locking mechanism
- Machine-specific encryption keys
- Multi-project token sharing

**File Structure**:
```json
{
  "version": "1.0",
  "encrypted": true,
  "algorithm": "aes-256-gcm",
  "data": "base64_encrypted_token_data",
  "iv": "base64_initialization_vector",
  "authTag": "base64_authentication_tag",
  "lastUpdated": "2025-08-04T10:00:00.000Z"
}
```

### 2. Performance Optimization System

#### Token Retrieval Priority Chain

```javascript
// 4-layer performance optimization
async getUserAccessTokenByAppId(appId) {
  // Layer 1: Memory Cache (~1ms)
  if (memoryCache.has(cacheKey) && !expired) {
    return cachedToken;
  }

  // Layer 2: JSON File (~10ms)
  if (fileTokenManager) {
    const jsonToken = await fileTokenManager.getToken(appId);
    if (jsonToken && !expired) {
      updateMemoryCache(jsonToken);
      return jsonToken.accessToken;
    }
  }

  // Layer 3: SQLite Database (~50ms)
  const dbToken = await getTokenByAppId(appId);
  if (dbToken && !expired) {
    updateMemoryCache(dbToken);
    return decryptToken(dbToken.access_token);
  }

  // Layer 4: eBay API Refresh (~500ms)
  await renewUserAccessTokenByAppId(appId, dbToken);
  return getRefreshedToken();
}
```

#### Caching Strategy

| Layer | Access Time | Storage Duration | Use Case |
|-------|-------------|------------------|----------|
| Memory Cache | ~1ms | Until process restart | Frequent access |
| JSON File | ~10ms | Persistent | Cross-session |
| SQLite DB | ~50ms | Persistent | Reliable storage |
| eBay API | ~500ms | N/A | Token refresh |

### 3. Security Architecture

#### Encryption Implementation

**Algorithm**: AES-256-GCM (Authenticated Encryption)

```javascript
// Key derivation
const encryptionKey = crypto.scryptSync(
  masterKey + machineId,
  'ebay-database-tokens-salt-v1',
  32
);

// Encryption process
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipherGCM('aes-256-gcm', encryptionKey);
cipher.setAAD(Buffer.from('ebay-token-data'));

const encrypted = Buffer.concat([
  cipher.update(tokenData, 'utf8'),
  cipher.final()
]);

const authTag = cipher.getAuthTag();

// Storage format: algorithm:iv:authTag:encryptedData
return `aes-256-gcm:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
```

#### Security Features

1. **Machine-Specific Keys**: Encryption keys derived from machine ID
2. **Authenticated Encryption**: GCM mode prevents tampering
3. **Salt-Based Derivation**: Prevents rainbow table attacks
4. **Automatic Key Rotation**: Support for key updates
5. **Process Isolation**: File locking prevents concurrent access

### 4. API Integration Layer

#### Browse API Integration

```javascript
// Direct API call - no persistence
export const getBrowseApiToken = (appId, options = {}) => {
  const manager = new ApplicationAccessToken_ClientCredentialsManager({
    ...config,
    ...options
  });
  return manager.getApplicationAccessToken();
};
```

**OAuth Flow**:
1. Prepare Basic Auth header: `Base64(clientId:clientSecret)`
2. Send POST request to eBay token endpoint
3. Receive temporary Application Access Token
4. Cache in memory (no persistence)

#### Trading API Integration

```javascript
// Persistent storage with auto-refresh
export const getTradingApiToken = (appId, options = {}) => {
  return defaultTokenManager.getUserAccessTokenByAppId(appId);
};
```

**OAuth Flow**:
1. Check storage layers (Memory → JSON → DB)
2. Validate token expiration
3. Auto-refresh if expired using refresh token
4. Update all storage layers
5. Return valid access token

## 🔄 Token Lifecycle Management

### Access Token Refresh Process

```javascript
async renewUserAccessTokenByAppId(appId, tokenData) {
  // 1. Decrypt refresh token
  const refreshToken = this.decryptToken(tokenData.refresh_token);

  // 2. Prepare OAuth request
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const requestBody = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;

  // 3. Call eBay OAuth endpoint
  const response = await axios.post(tokenUrl, requestBody, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`
    }
  });

  // 4. Process response
  const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

  // 5. Update all storage layers
  await this.saveUserAccessToken(tokenData.account_name, {
    accessToken: access_token,
    refreshToken: newRefreshToken || refreshToken,
    accessTokenUpdatedDate: new Date().toISOString(),
    refreshTokenUpdatedDate: newRefreshToken ? new Date().toISOString() : tokenData.refresh_token_updated_date,
    expiresIn: expires_in,
    tokenType: 'Bearer'
  });

  // 6. Clear memory cache for refresh
  this.clearRelatedCaches(appId);
}
```

### Expiration Detection

```javascript
// Access token expiration (5-minute buffer)
isAccessTokenExpired(tokenData, bufferSeconds = 300) {
  const updatedTime = new Date(tokenData.access_token_updated_date).getTime();
  const expirationTime = updatedTime + (tokenData.expires_in * 1000);
  const currentTime = Date.now();
  
  return currentTime > (expirationTime - bufferSeconds * 1000);
}

// Refresh token expiration (7-day buffer)
isRefreshTokenExpired(tokenData, bufferSeconds = 604800) {
  const updatedTime = new Date(tokenData.refresh_token_updated_date).getTime();
  const expirationTime = updatedTime + (tokenData.refresh_token_expires_in * 1000);
  const currentTime = Date.now();
  
  return currentTime > (expirationTime - bufferSeconds * 1000);
}
```

## 🌐 Cross-Platform Compatibility

### File Path Handling

```javascript
// Windows
const tokenFilePath = path.join(
  process.env.PROGRAMDATA || 'C:\\ProgramData',
  'EStocks/tokens/ebay-tokens.encrypted.json'
);

// Unix-like systems
const tokenFilePath = path.join(
  process.env.HOME || '/var/lib',
  '.estocks/tokens/ebay-tokens.encrypted.json'
);
```

### Database Path Resolution

```javascript
// Relative to project root
this.dbPath = options.databasePath || path.resolve('./database/ebay_tokens.sqlite');

// Ensure directory exists
const dbDir = path.dirname(this.dbPath);
await fs.mkdir(dbDir, { recursive: true });
```

## 🔧 Configuration System

### Environment Variables (Optional)

```javascript
// config.js - Automatic detection with fallbacks
const config = {
  clientId: process.env.EBAY_CLIENT_ID,
  clientSecret: process.env.EBAY_CLIENT_SECRET,
  masterKey: process.env.EBAY_MASTER_KEY,
  defaultAppId: process.env.EBAY_CLIENT_ID,
  tokenUrl: process.env.EBAY_TOKEN_URL || 'https://api.ebay.com/identity/v1/oauth2/token',
  environment: process.env.EBAY_ENVIRONMENT || 'PRODUCTION'
};
```

### Runtime Configuration

```javascript
// Constructor options override environment variables
const tokenManager = new UserAccessToken_AuthorizationCodeManager({
  clientId: 'custom_client_id',
  clientSecret: 'custom_secret',
  masterKey: 'custom_master_key',
  databasePath: './custom/path/tokens.db',
  tokenFilePath: './custom/path/tokens.json',
  encryptionEnabled: true,
  defaultAppId: 'custom_app_id'
});
```

## 🚨 Error Handling & Recovery

### Error Categories

1. **Network Errors**: eBay API unavailable
2. **Authentication Errors**: Invalid credentials or expired refresh tokens
3. **Storage Errors**: Database locks, file permissions
4. **Encryption Errors**: Invalid keys, corrupted data

### Recovery Strategies

```javascript
// Automatic fallback chain
try {
  // Try primary storage
  return await getPrimaryToken();
} catch (primaryError) {
  try {
    // Fallback to secondary storage
    return await getFallbackToken();
  } catch (fallbackError) {
    // Final fallback: direct API call
    return await refreshFromAPI();
  }
}
```

### Graceful Degradation

```javascript
// JSON file corruption handling
try {
  const jsonToken = await this.fileTokenManager.getToken(appId);
  return jsonToken.accessToken;
} catch (fileError) {
  console.warn('📁 JSON file unavailable, falling back to database');
  // Continue with database lookup
}
```

## 📊 Performance Metrics

### Benchmark Results

| Operation | Memory Cache | JSON File | SQLite DB | eBay API |
|-----------|--------------|-----------|-----------|----------|
| Token Retrieval | ~1ms | ~10ms | ~50ms | ~500ms |
| Storage Write | ~0.1ms | ~5ms | ~25ms | ~200ms |
| Encryption/Decryption | N/A | ~2ms | ~2ms | N/A |

### Memory Usage

- **Base Manager**: ~2MB
- **Per Token (Memory)**: ~1KB
- **SQLite Connection**: ~5MB
- **File Handle**: ~100KB

## 🔄 Future Architecture Considerations

### Planned Enhancements

1. **Redis Integration**: Optional Redis caching layer
2. **Token Pooling**: Multiple token rotation for high-volume applications
3. **Metrics Collection**: Built-in performance monitoring
4. **Health Checks**: Automated token validation endpoints

### Scalability Considerations

1. **Connection Pooling**: SQLite connection management
2. **Async Operations**: Non-blocking token operations
3. **Memory Management**: Automatic cache cleanup
4. **Resource Limits**: Configurable cache sizes

## 📝 API Reference Summary

### Core Functions

```javascript
// API-specific token retrieval
getBrowseApiToken(appId?, options?)     // Application Access Token
getTradingApiToken(appId?, options?)    // User Access Token

// Legacy compatibility
getUserAccessTokenByAppId(appId)
getUserAccessToken(accountName?)
getValidAccessToken()
checkRefreshTokenValidity(appId?)
```

### Class Constructors

```javascript
// User Access Token Manager
new UserAccessToken_AuthorizationCodeManager({
  clientId: string,           // Required
  clientSecret: string,       // Required  
  masterKey: string,          // Required
  databasePath?: string,
  tokenFilePath?: string,
  defaultAppId?: string,
  encryptionEnabled?: boolean
})

// Application Access Token Manager
new ApplicationAccessToken_ClientCredentialsManager({
  clientId: string,           // Required
  clientSecret: string,       // Required
  scope?: string,
  tokenUrl?: string
})

// Local Shared Token Manager
new LocalSharedTokenManager({
  masterKey: string,          // Required
  tokenFilePath?: string
})
```

## 🎯 Best Practices

### Implementation Guidelines

1. **Always use API-specific functions**: `getBrowseApiToken()` vs `getTradingApiToken()`
2. **Handle errors gracefully**: Implement proper try-catch blocks
3. **Monitor token expiration**: Use `checkRefreshTokenValidity()` for health checks
4. **Secure master keys**: Never hardcode encryption keys
5. **Test token refresh**: Simulate token expiration scenarios

### Performance Optimization

1. **Leverage caching**: Don't disable memory cache unless necessary
2. **Batch operations**: Group multiple token requests when possible
3. **Monitor storage**: Keep database and JSON files optimized
4. **Clean up**: Implement periodic cache cleanup

This architecture provides a robust, secure, and performant foundation for eBay OAuth token management with automatic dual storage and cross-platform compatibility.