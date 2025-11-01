# e-auth-manager

Minimal OAuth 2.0 token management utilities for Node.js.

Note: This package provides general-purpose helpers for managing and caching OAuth tokens in server-side applications. It is provider-agnostic and not affiliated with any specific platform.

## Install

```bash
npm install @naosan/e-auth-manager
```

## Usage

```js
import { getBrowseApiToken, getTradingApiToken } from '@naosan/e-auth-manager';

// Obtain an application-scoped token (client credentials)
const appToken = await getBrowseApiToken();

// Obtain a user-scoped token (authorization code + refresh token)
const userToken = await getTradingApiToken('your-app-id');
```

For detailed documentation or support, please contact the maintainer.

