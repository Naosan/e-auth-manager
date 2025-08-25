/**
 * @typedef {{ refreshToken: string, version: number, updatedAt: string }} RefreshRecord
 */

/**
 * Abstract base class for token providers that manage centralized refresh token storage.
 * Provides the contract for SSOT (Single Source of Truth) implementations.
 */
export class TokenProvider {
  /**
   * Get refresh token record for the specified App ID
   * @param {string} _appId - The eBay App ID
   * @returns {Promise<RefreshRecord|null>} Refresh token record or null if not found
   */
  async get(_appId) {
    throw new Error('TokenProvider.get() not implemented');
  }

  /**
   * Set refresh token for the specified App ID with version control
   * @param {string} _appId - The eBay App ID
   * @param {string} _refreshToken - The refresh token to store
   * @param {number} _version - Version number for optimistic locking
   * @returns {Promise<RefreshRecord>} The stored refresh token record
   */
  async set(_appId, _refreshToken, _version) {
    throw new Error('TokenProvider.set() not implemented');
  }

  /**
   * Execute function within distributed lock context
   * @param {string} _appId - The eBay App ID to lock
   * @param {Function} fn - Function to execute under lock
   * @param {number} _ttlMs - Lock timeout in milliseconds (default: 5000)
   * @returns {Promise<*>} Result of the executed function
   */
  async withLock(_appId, fn, _ttlMs = 5000) {
    throw new Error('TokenProvider.withLock() not implemented');
  }
}

export default TokenProvider;