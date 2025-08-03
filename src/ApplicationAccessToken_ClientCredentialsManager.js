// ApplicationAccessToken_ClientCredentialsManager.js - eBay Application Access Token Management (client_credentials grant)
import axios from 'axios';

class ApplicationAccessToken_ClientCredentialsManager {
  constructor(options = {}) {
    // Validate required options
    if (!options.clientId) {
      throw new Error('clientId is required. Pass it as option or set EBAY_CLIENT_ID environment variable.');
    }
    if (!options.clientSecret) {
      throw new Error('clientSecret is required. Pass it as option or set EBAY_CLIENT_SECRET environment variable.');
    }

    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.tokenUrl = options.tokenUrl || 'https://api.ebay.com/identity/v1/oauth2/token';
    this.scope = options.scope || 'https://api.ebay.com/oauth/api_scope';
    
    // In-memory cache for performance
    this.memoryCache = {
      token: null,
      expiration: null
    };
  }

  async getApplicationAccessToken() {
    try {
      // Check memory cache first
      if (this.memoryCache.token && this.memoryCache.expiration > Date.now()) {
        console.log('✅ Using cached Application Access Token');
        return this.memoryCache.token;
      }

      console.log('🔄 Getting new Application Access Token from eBay API...');

      // Need to renew token
      const tokenData = await this.renewApplicationAccessToken();
      
      // Update memory cache
      this.updateMemoryCache(tokenData.accessToken, tokenData.expiresIn);

      return tokenData.accessToken;
    } catch (error) {
      console.error('🚨 Failed to get valid access token:', error.message);
      throw error;
    }
  }

  async renewApplicationAccessToken() {
    try {
      console.log('🔄 Renewing Application Access Token...');
      
      // Log basic info (without sensitive data)
      console.log('Client ID:', this.clientId?.substring(0, 10) + '...');
      console.log('Token URL:', this.tokenUrl);
      console.log('Scope:', this.scope);

      // Prepare OAuth request
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      console.log('Auth header:', `Basic ${auth.substring(0, 20)}...`);

      const response = await axios.post(
        this.tokenUrl,
        `grant_type=client_credentials&scope=${encodeURIComponent(this.scope)}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`,
          }
        }
      );

      const data = response.data;
      console.log('✅ Application Access Token renewed successfully');
      console.log('Token Type:', data.token_type);
      console.log('Expires In:', data.expires_in, 'seconds');

      return {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresIn: data.expires_in,
        scope: data.scope || this.scope,
        accessTokenUpdatedDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('🚨 Failed to renew Application Access Token:', error.message);
      if (error.response?.data) {
        console.error('eBay API error response:', error.response.data);
      }
      throw new Error(`eBay token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  updateMemoryCache(token, expiresIn) {
    this.memoryCache.token = token;
    // Cache expires 60 seconds before actual token expiration
    this.memoryCache.expiration = Date.now() + (expiresIn - 60) * 1000;
  }

  isExpired(tokenData) {
    if (!tokenData.expiresIn || !tokenData.accessTokenUpdatedDate) {
      return true;
    }

    const updatedTime = new Date(tokenData.accessTokenUpdatedDate).getTime();
    const expirationTime = updatedTime + (tokenData.expiresIn * 1000);
    
    return Date.now() > expirationTime;
  }
}

export default ApplicationAccessToken_ClientCredentialsManager;