// ebayScopes.js - Centralized eBay OAuth Scope Definitions
// This file contains all eBay OAuth scope configurations for different APIs and use cases

/**
 * eBay OAuth Scope Definitions
 * 
 * Trading API: Traditional XML-based API that doesn't require OAuth scopes
 * REST APIs: Modern APIs that require specific OAuth scopes for access
 * 
 * Reference: https://developer.ebay.com/api-docs/static/oauth-scopes.html
 * 
 * =========================
 * 使用ガイドライン
 * =========================
 * 
 * 1. **Trading API (XML-based APIs)**
 *    - GetSellerList, GetItem, ReviseItem など
 *    - scopeは不要です。EBAY_SCOPES.TRADING_API (空配列) を使用
 *    - 例: tokenManager.renewUserAccessToken(accountName, tokenData)
 * 
 * 2. **REST APIs (Modern JSON APIs)**
 *    - 必ずappropriate scopeを指定する必要があります
 *    - 例: tokenManager.renewUserAccessToken(accountName, tokenData, { 
 *            scopes: EBAY_SCOPES.REST_API_BASIC 
 *          })
 * 
 * 3. **Scope選択の原則**
 *    - 最小権限の原則: 必要最小限のscopeのみを要求
 *    - Trading APIとREST APIを混在して使用する場合でも、Trading APIにはscope不要
 *    - 新しいscopeが必要な場合は、ユーザーの再認証が必要
 * 
 * 4. **重要な注意事項**
 *    - scopeパラメータを省略すると、元のconsent時の全scopeが維持されます
 *    - scopeを指定する場合、元のconsentのサブセットである必要があります
 *    - 過剰なscope要求は、セキュリティリスクとユーザーの信頼を損ないます
 */
export const EBAY_SCOPES = {
  // Trading API - No scopes required
  TRADING_API: [],
  
  // Basic API access
  REST_API_BASIC: [
    'https://api.ebay.com/oauth/api_scope'
  ],
  
  // Seller APIs - Read Only
  SELL_READONLY: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.stores.readonly'
  ],
  
  // Seller APIs - Full Access
  SELL_FULL: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
    'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
    'https://api.ebay.com/oauth/api_scope/sell.reputation',
    'https://api.ebay.com/oauth/api_scope/sell.stores'
  ],
  
  // Seller APIs - Marketing only
  MARKETING_READONLY: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly'
  ],

  MARKETING_FULL: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing'
  ],

  // Buy APIs
  BUY_APIS: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/buy.marketplace.insights'
  ],
  
  // Commerce APIs
  COMMERCE_APIS: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly'
  ],
  
  // Custom scope combinations for specific applications
  PRICE_OPTIMIZER: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.marketing'
  ],
  
  STOCK_MONITOR: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly'
  ]
};

/**
 * Get scope string for OAuth requests
 * @param {Array<string>} scopes - Array of scope URLs
 * @returns {string} Space-separated scope string
 */
export function getScopeString(scopes) {
  if (!scopes || scopes.length === 0) {
    return '';
  }
  return scopes.join(' ');
}

/**
 * Validate if requested scopes are subset of granted scopes
 * @param {Array<string>} requestedScopes - Scopes being requested
 * @param {Array<string>} grantedScopes - Originally granted scopes
 * @returns {boolean} True if valid subset
 */
export function validateScopeSubset(requestedScopes, grantedScopes) {
  if (!requestedScopes || requestedScopes.length === 0) {
    return true; // Empty scope request is always valid
  }
  
  return requestedScopes.every(scope => grantedScopes.includes(scope));
}

/**
 * Get appropriate scopes for API type
 * @param {string} apiType - Type of API ('trading', 'rest', 'sell', 'buy')
 * @param {boolean} readOnly - Whether to use read-only scopes
 * @returns {Array<string>} Array of scope URLs
 */
export function getScopesForApiType(apiType, readOnly = false) {
  switch (apiType.toLowerCase()) {
  case 'trading':
    return EBAY_SCOPES.TRADING_API;
  case 'rest':
    return EBAY_SCOPES.REST_API_BASIC;
  case 'sell':
    return readOnly ? EBAY_SCOPES.SELL_READONLY : EBAY_SCOPES.SELL_FULL;
  case 'marketing':
    return readOnly ? EBAY_SCOPES.MARKETING_READONLY : EBAY_SCOPES.MARKETING_FULL;
  case 'buy':
    return EBAY_SCOPES.BUY_APIS;
  case 'commerce':
    return EBAY_SCOPES.COMMERCE_APIS;
  default:
    return EBAY_SCOPES.REST_API_BASIC;
  }
}

/**
 * =========================
 * 利用可能な全eBay OAuth Scope一覧
 * =========================
 * 
 * 以下は実際に使用されているeBay OAuth scopeの完全なリストです。
 * 必要に応じてこれらのscopeを組み合わせて使用してください。
 * 
 * 基本API:
 * - "https://api.ebay.com/oauth/api_scope"                                    // 基本的なAPI アクセス
 * 
 * 販売者API (Marketing):
 * - "https://api.ebay.com/oauth/api_scope/sell.marketing"                     // マーケティング機能 (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly"            // マーケティング機能 (読み取り専用)
 * 
 * 販売者API (Inventory):
 * - "https://api.ebay.com/oauth/api_scope/sell.inventory"                     // 在庫管理 (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly"            // 在庫管理 (読み取り専用)
 * 
 * 販売者API (Account):
 * - "https://api.ebay.com/oauth/api_scope/sell.account"                       // アカウント管理 (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/sell.account.readonly"              // アカウント管理 (読み取り専用)
 * 
 * 販売者API (Fulfillment):
 * - "https://api.ebay.com/oauth/api_scope/sell.fulfillment"                   // 注文履行 (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly"          // 注文履行 (読み取り専用)
 * 
 * 販売者API (Analytics):
 * - "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly"            // 分析データ (読み取り専用)
 * 
 * 販売者API (Finances):
 * - "https://api.ebay.com/oauth/api_scope/sell.finances"                      // 財務情報
 * 
 * 販売者API (Payment Dispute):
 * - "https://api.ebay.com/oauth/api_scope/sell.payment.dispute"               // 支払い紛争処理
 * 
 * 販売者API (Reputation):
 * - "https://api.ebay.com/oauth/api_scope/sell.reputation"                    // 評価管理 (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/sell.reputation.readonly"           // 評価管理 (読み取り専用)
 * 
 * 販売者API (Stores):
 * - "https://api.ebay.com/oauth/api_scope/sell.stores"                        // ストア管理 (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/sell.stores.readonly"               // ストア管理 (読み取り専用)
 * 
 * Commerce API:
 * - "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"         // ID情報 (読み取り専用)
 * - "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription" // 通知サブスクリプション (フルアクセス)
 * - "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly" // 通知サブスクリプション (読み取り専用)
 * 
 * Buy API:
 * - "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights"           // マーケットプレイス洞察
 * 
 * 使用例:
 * 在庫管理システムの場合:
 * const inventoryScopes = [
 *   "https://api.ebay.com/oauth/api_scope",
 *   "https://api.ebay.com/oauth/api_scope/sell.inventory"
 * ];
 * 
 * 価格最適化システムの場合:
 * const priceOptimizationScopes = [
 *   "https://api.ebay.com/oauth/api_scope",
 *   "https://api.ebay.com/oauth/api_scope/sell.inventory",
 *   "https://api.ebay.com/oauth/api_scope/sell.marketing"
 * ];
 */

// Export default for backward compatibility
export default EBAY_SCOPES;
