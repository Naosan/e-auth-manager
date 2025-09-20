// Example: Fetch item conditions (conditionId, conditionName) for a category via Sell Metadata API
// Usage:
//   node examples/sell-metadata-item-conditions.js --marketplace EBAY_US --category 9355
//   EBAY_CLIENT_ID/SECRET and a valid refresh token must be configured.

import axios from 'axios';
import { getSellMetadataApiToken } from '../src/index.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { marketplace: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US', category: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--marketplace') { out.marketplace = args[++i]; continue; }
    if (a.startsWith('--marketplace=')) { out.marketplace = a.split('=')[1]; continue; }
    if (a === '--category') { out.category = args[++i]; continue; }
    if (a.startsWith('--category=')) { out.category = a.split('=')[1]; continue; }
  }
  return out;
}

async function main() {
  const { marketplace, category } = parseArgs(process.argv);
  if (!category) {
    console.error('Usage: --category <categoryId> [--marketplace EBAY_US]');
    process.exit(1);
  }

  const token = await getSellMetadataApiToken();
  const url = `https://api.ebay.com/sell/metadata/v1/marketplace/${marketplace}/get_item_condition_policies`;
  const { data } = await axios.get(url, {
    params: { category_id: category },
    headers: { Authorization: `Bearer ${token}` }
  });

  const policies = data?.itemConditionPolicies || [];
  const list = policies[0]?.itemConditions || [];
  if (!list.length) {
    console.log('No item conditions found. Check category and permissions.');
    return;
  }
  console.log('conditionId,conditionName');
  for (const c of list) {
    console.log(`${c.id},${c.name}`);
  }
}

main().catch(err => {
  console.error('Failed to fetch item conditions:', err?.response?.data || err.message);
  process.exit(1);
});

