// FileJsonTokenProvider.test.js - Basic tests for centralized JSON token provider
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { FileJsonTokenProvider } from '../../src/providers/FileJsonTokenProvider.js';

describe('FileJsonTokenProvider', () => {
  let provider;
  let testFilePath;
  let testMasterKey;

  beforeEach(() => {
    testFilePath = path.resolve('./tests/temp/test-ssot-tokens.json');
    testMasterKey = 'test-master-key-for-unit-tests';
    provider = new FileJsonTokenProvider({
      filePath: testFilePath,
      masterKey: testMasterKey,
      namespace: 'test-ebay-oauth'
    });
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await fs.unlink(testFilePath);
      await fs.unlink(`${testFilePath}.lock`);
      await fs.unlink(`${testFilePath}.tmp`);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('should create a new FileJsonTokenProvider instance', () => {
    expect(provider).toBeInstanceOf(FileJsonTokenProvider);
    expect(provider.filePath).toBe(testFilePath);
    expect(provider.lockDir).toBe(`${testFilePath}.locks`);
    expect(provider.ns).toBe('test-ebay-oauth');
  });

  it('should require filePath and masterKey in constructor', () => {
    expect(() => new FileJsonTokenProvider({ masterKey: 'test' }))
      .toThrow('filePath is required');
    
    expect(() => new FileJsonTokenProvider({ filePath: 'test.json' }))
      .toThrow('masterKey is required for FileJsonTokenProvider');
  });

  it('should return null for non-existent appId', async () => {
    const result = await provider.get('non-existent-app-id');
    expect(result).toBe(null);
  });

  it('should store and retrieve refresh token with version control', async () => {
    const appId = 'test-app-id';
    const refreshToken = 'test-refresh-token-12345';
    const version = 1;

    // Store token
    const stored = await provider.set(appId, refreshToken, version);
    expect(stored.refreshToken).toBe(refreshToken);
    expect(stored.version).toBe(version);
    expect(stored.updatedAt).toBeDefined();

    // Retrieve token
    const retrieved = await provider.get(appId);
    expect(retrieved.refreshToken).toBe(refreshToken);
    expect(retrieved.version).toBe(version);
    expect(retrieved.updatedAt).toBe(stored.updatedAt);
  });

  it('should encrypt stored tokens (not plain text)', async () => {
    const appId = 'encryption-test-app';
    const refreshToken = 'secret-refresh-token-to-encrypt';
    const version = 1;

    await provider.set(appId, refreshToken, version);

    // Read raw file content to verify encryption
    const rawContent = await fs.readFile(testFilePath, 'utf8');
    const state = JSON.parse(rawContent);
    
    expect(rawContent).not.toContain(refreshToken); // Token should not appear in plain text
    expect(state.apps[appId].refreshTokenEnc).toMatch(/^gcm:/); // Should use GCM encryption format
  });

  it('should handle concurrent operations with locking', async () => {
    const appId = 'concurrent-test-app';
    const operations = [];

    // Start multiple concurrent set operations
    for (let i = 0; i < 5; i++) {
      operations.push(
        provider.set(appId, `token-${i}`, i)
      );
    }

    const results = await Promise.all(operations);
    
    // All operations should complete successfully
    expect(results.length).toBe(5);
    results.forEach(result => {
      expect(result.refreshToken).toMatch(/^token-\d$/);
      expect(result.version).toBeGreaterThanOrEqual(0);
      expect(result.updatedAt).toBeDefined();
    });

    // Final state should contain last written token
    const final = await provider.get(appId);
    expect(final).toBeDefined();
    expect(final.refreshToken).toMatch(/^token-\d$/);
  });

  it('should handle withLock timeout (via stale lock simulation)', async () => {
    const appId = 'timeout-test-app';
    
    // Create a stale lock file manually (older than TTL)
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
    await fs.mkdir(provider.lockDir, { recursive: true });
    const lockPath = path.join(provider.lockDir, `${provider.ns}.${appId}.lock`);
    await fs.writeFile(lockPath, 'stale-lock');
    
    // Set lock file timestamp to past (simulate stale lock older than 6 seconds)
    const pastTime = (Date.now() - 6000) / 1000;
    await fs.utimes(lockPath, pastTime, pastTime);

    // This should succeed because stale lock should be cleaned up
    const result = await provider.withLock(appId, async () => {
      return 'stale-lock-cleaned';
    }, 1000);

    expect(result).toBe('stale-lock-cleaned');
  });

  it('should maintain backward compatibility with plain text tokens', async () => {
    const appId = 'backward-compat-app';
    
    // Manually create old format state (plain text)
    const oldState = {
      version: 1,
      updatedAt: new Date().toISOString(),
      apps: {
        [appId]: {
          refreshToken: 'plain-text-token', // Old format (not encrypted)
          version: 1,
          updatedAt: new Date().toISOString()
        }
      }
    };

    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
    await fs.writeFile(testFilePath, JSON.stringify(oldState, null, 2));

    // Should be able to read old format
    const retrieved = await provider.get(appId);
    expect(retrieved.refreshToken).toBe('plain-text-token');
    expect(retrieved.version).toBe(1);
  });
});