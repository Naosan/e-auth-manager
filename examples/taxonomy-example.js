// eBay Taxonomy API Example using getTaxonomyApiToken()
import { getTaxonomyApiToken } from '../src/index.js';
import axios from 'axios';

class eBayTaxonomyClient {
  constructor() {
    this.baseURL = 'https://api.ebay.com/commerce/taxonomy/v1';
  }

  async getCategoryTree(categoryTreeId = '0') {
    try {
      console.log('🏷️ Getting Taxonomy API token...');
      const token = await getTaxonomyApiToken();
      
      console.log('📊 Fetching category tree...');
      const response = await axios.get(`${this.baseURL}/category_tree/${categoryTreeId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching category tree:', error.message);
      throw error;
    }
  }

  async getItemAspectsForCategory(categoryId) {
    try {
      console.log('🏷️ Getting Taxonomy API token...');
      const token = await getTaxonomyApiToken();
      
      console.log(`🔍 Fetching item aspects for category ${categoryId}...`);
      const response = await axios.get(
        `${this.baseURL}/category_tree/0/get_item_aspects_for_category`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: { category_id: categoryId }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching item aspects:', error.message);
      throw error;
    }
  }

  async getCategorySuggestions(q) {
    try {
      console.log('🏷️ Getting Taxonomy API token...');
      const token = await getTaxonomyApiToken();
      
      console.log(`🔍 Getting category suggestions for "${q}"...`);
      const response = await axios.get(
        `${this.baseURL}/category_tree/0/get_category_suggestions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: { q }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching category suggestions:', error.message);
      throw error;
    }
  }
}

// Example usage
async function main() {
  try {
    const taxonomyClient = new eBayTaxonomyClient();
    
    // Get default category tree
    console.log('\n=== Getting Category Tree ===');
    const categoryTree = await taxonomyClient.getCategoryTree();
    console.log(`Found ${categoryTree.categoryTreeNodes?.length || 0} categories`);
    
    // Get item aspects for Electronics category (example)
    console.log('\n=== Getting Item Aspects ===');
    const aspects = await taxonomyClient.getItemAspectsForCategory('58058');
    console.log(`Found ${aspects.aspects?.length || 0} aspects for category`);
    
    // Get category suggestions
    console.log('\n=== Getting Category Suggestions ===');
    const suggestions = await taxonomyClient.getCategorySuggestions('laptop');
    console.log(`Found ${suggestions.categorySuggestions?.length || 0} suggestions for "laptop"`);
    
  } catch (error) {
    console.error('❌ Example failed:', error.message);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default eBayTaxonomyClient;