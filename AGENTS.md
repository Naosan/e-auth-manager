# Agent Guide: eBay OAuth Token Manager

This document gives AI coding agents concise, practical instructions for working in this repository.

## What This Repo Is
- Node.js library (ESM) for managing eBay OAuth 2.0 tokens.
- Production‑oriented features: dual storage (SQLite + encrypted JSON), AES‑256 encryption, multi‑instance coordination (SSOT), and API‑specific helpers.
- Package name: `@naosan-internal/pipeline-kit` (published to GitHub Packages).
- Minimum Node version: `>=16`.

## How It’s Used
- This is a library, not a service or CLI.
- External apps import functions/classes from `src/index.js` (see Exports).
- Tokens are obtained for two flows:
  - Application Access Token (client credentials) for public/read APIs.
  - User Access Token (authorization code + refresh token) for user‑scoped operations.

## Entry Points / Exports
- Main entry: `src/index.js`
- Exports (also defined in `package.json#exports`):
  - `.` → `./src/index.js`
  - `./database` → `./src/UserAccessToken_AuthorizationCodeManager.js`
  - `./file` → `./src/LocalSharedTokenManager.js`
  - `./scopes` → `./src/ebayScopes.js`
- Key functions from `src/index.js`:
  - `getBrowseApiToken()` – App token (client credentials)
  - `getTaxonomyApiToken()` – App token for taxonomy
  - `getTradingApiToken(appId)` – User token (authorization code)
  - `getMarketingApiToken(appId, opts)` – User token with scope presets
  - `getRefreshTokenHealth(appId)` / `checkRefreshTokenValidity(appId)`
  - Token info helpers: `getUserTokenInfo`, `getUserTokenExpiration`, `getUserAccountName`
  - Classes: `LocalSharedTokenManager`, `ApplicationAccessToken_ClientCredentialsManager`, `UserAccessToken_AuthorizationCodeManager`

## Runtime / Env Vars
- Required for requests:
  - `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`
- Optional / recommended:
  - `EBAY_OAUTH_TOKEN_MANAGER_MASTER_KEY` – overrides per‑machine default key for encryption; set this when sharing across hosts.
  - `EBAY_INITIAL_REFRESH_TOKEN` – seeds the default account once.
  - `OAUTH_SSOT_JSON`, `TOKEN_NAMESPACE` – for multi‑instance coordination.
  - `EBAY_ENVIRONMENT` – `PRODUCTION` (default) or `SANDBOX`.

## Packaging / Registry
- Published to GitHub Packages (see `.github/workflows/publish.yml`).
- `package.json` defines:
  - `name`: `@naosan-internal/pipeline-kit`
  - `peerDependencies`: `sqlite3`, `sqlite` (consumers must install)
  - `type`: `module` (ESM syntax)
- To consume from GitHub Packages:
  1) Configure `.npmrc`:
     ```
     @naosan:registry=https://npm.pkg.github.com
     //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
     ```
  2) Use a PAT with `read:packages` for installs (`NODE_AUTH_TOKEN` in CI).

## Coding Conventions (for agents)
- Use ESM `import`/`export`. Do not switch to CommonJS.
- Keep public API surface centralized in `src/index.js`.
- Preserve dual‑storage behavior (SQLite + encrypted JSON) and do not remove encryption.
- Avoid logging sensitive values (tokens, secrets). Keep console output minimal and low‑risk.
- Maintain Node `>=16` compatibility.
- Keep naming consistent with existing classes/functions.

## Testing / Linting
- Tests: `npm test` (Jest with `--experimental-vm-modules`).
- Lint: `npm run lint` (ESLint on `src/`).

## CI/CD
- `ci.yml` runs lint + tests on Node 16/18/20.
- `publish.yml` publishes to GitHub Packages on GitHub Releases using `secrets.GITHUB_TOKEN`.

## Quick One‑Liner for Agents
"This repo is an ESM Node library providing eBay OAuth token management (app+user flows) with SQLite + encrypted JSON storage; import from `@naosan-internal/pipeline-kit`, Node >=16."

## Safety Notes
- Never commit real tokens/credentials.
- Do not add code that prints raw tokens.
- If adding features that touch storage/encryption, preserve backward compatibility with existing formats.

---
If you are an agent operating within this repo, assume library usage by external apps and keep changes surgical, backwards‑compatible, and aligned with the exported API.
