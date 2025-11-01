# Bulk Refresh Token Seeding Guide

This guide explains how to preload or update refresh tokens for multiple accounts using the helper script bundled with the library.

> **Why this guide exists**
>
> Large README edits often collide with downstream changes. Moving the seeding workflow into a dedicated document helps avoid README merge conflicts while keeping the instructions easy to discover.

## When to use the helper

Use the helper script when you need to:

- Register refresh tokens for more than the default account/App ID pair.
- Update existing entries in the Single Source of Truth (SSOT) JSON or SQLite database after your provider rotates credentials.
- Backfill tokens in a new environment without re-running the manual OAuth flow for every seller.

The helper persists tokens through the same storage layers as the runtime library:

1. SQLite database (local authoritative store)
2. Encrypted JSON cache (shared across local processes)
3. SSOT JSON provider (if configured)

## Preparing seed data

You can describe refresh tokens either inline or via a JSON file. Each entry must provide an `accountName`, `appId`, and the `refreshToken` you obtained from your OAuth provider.

### Option A: Inline JSON

Set the environment variable before running the script (recommended for CI/CD pipelines):

```bash
EBAY_REFRESH_TOKEN_SEED_JSON='[
  {"accountName": "sellerA", "appId": "YourAppIDA", "refreshToken": "v=1.abcdef"},
  {"accountName": "sellerB", "appId": "YourAppIDB", "refreshToken": "v=1.uvwxyz"}
]'
```

### Option B: JSON file

Create a file anywhere accessible to the script. Relative paths are resolved from the repository root.

```json
[
  { "accountName": "sellerA", "appId": "YourAppIDA", "refreshToken": "v=1.abcdef" },
  { "accountName": "sellerB", "appId": "YourAppIDB", "refreshToken": "v=1.uvwxyz" }
]
```

Expose the file via `.env`:

```bash
EBAY_REFRESH_TOKEN_SEED_FILE=config/refresh-token-seed.json
```

> **Tip:** When an entry omits `accountName` or `appId`, the script falls back to `default` and the configured `EBAY_DEFAULT_APP_ID` respectively. Missing `refreshToken` values cause the entry to be skipped.

## Running the script

1. Ensure your `.env` file is loaded (e.g., run inside the repository root or export the variables manually).
2. Execute the helper:

   ```bash
   node examples/bulk-refresh-token-seed.js
   ```

3. Inspect the output:
   - `🎉 Successfully seeded …` indicates every entry was stored without error.
   - `⚠️ Completed with … failures.` means at least one entry was skipped—check the preceding error logs.

The helper exits with a non-zero status when failures occur, making it safe to wire into deployment pipelines.

## Relationship to `EBAY_INITIAL_REFRESH_TOKEN`

`EBAY_INITIAL_REFRESH_TOKEN` seeds only the default account/App ID when the manager is first instantiated. It **does not** cascade to other sellers. Use the helper to add or update any additional combinations.

If you rotate the default token, re-run the helper with the updated definition to keep all stores synchronized.

## Troubleshooting

- **“Set EBAY_REFRESH_TOKEN_SEED_JSON or EBAY_REFRESH_TOKEN_SEED_FILE”** – Provide at least one source of seed data.
- **JSON parsing errors** – Validate your JSON with an online formatter or `node -e 'JSON.parse(fs.readFileSync("file"))'` before running the helper.
- **Entries skipped due to missing `appId`** – Either populate `appId` in the entry or set `EBAY_DEFAULT_APP_ID` so the helper can fall back.
- **Lock contention warnings** – Clear stale `ebay-tokens.encrypted.json.lock` files if the script terminates unexpectedly before retrying.

For additional questions, see the README or open an issue.
