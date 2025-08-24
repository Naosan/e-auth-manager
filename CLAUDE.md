# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Testing
```bash
# Run tests
npm test

# Lint code
npm run lint

# Run example scripts
npm run example:database
npm run example:file
```

## High-Level Architecture

This is a Node.js library for managing eBay OAuth 2.0 tokens with a sophisticated multi-layered architecture:

### Core Design Principles
1. **Zero Configuration**: Automatic dual storage (SQLite + encrypted JSON) without requiring environment variables
2. **Performance Optimized**: 4-layer token retrieval system (Memory → JSON → Database → eBay API)
3. **API-Specific Functions**: Dedicated token managers for Browse API, Taxonomy API, and Trading API
4. **Security First**: AES-256-GCM encryption for all stored tokens

### Key Classes and Their Responsibilities

1. **UserAccessToken_AuthorizationCodeManager** (`src/UserAccessToken_AuthorizationCodeManager.js`)
   - Manages User Access Tokens for Trading API (private operations)
   - Implements automatic dual storage with SQLite database and encrypted JSON file
   - Handles token refresh using refresh tokens
   - Provides memory caching for performance

2. **ApplicationAccessToken_ClientCredentialsManager** (`src/ApplicationAccessToken_ClientCredentialsManager.js`)
   - Manages Application Access Tokens for Browse API (public data)
   - Temporary tokens with ~2 hour lifetime
   - Memory-only caching (no persistence)

3. **LocalSharedTokenManager** (`src/LocalSharedTokenManager.js`)
   - File-based token storage for cross-project sharing
   - Uses platform-specific secure locations
   - Process-safe file locking

### Token Retrieval Flow
1. Check memory cache (~1ms)
2. Check JSON file (~10ms)
3. Check SQLite database (~50ms)
4. Refresh from eBay API if expired (~500ms)

### Important Notes
- **Refresh tokens cannot be generated via API** - they must be obtained through manual browser-based OAuth flow
- The library uses ES modules (`type: "module"` in package.json)
- Encryption uses machine-specific keys derived from machine ID
- SQLite database uses WAL mode for better concurrency