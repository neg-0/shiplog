import Stripe from 'stripe';

const config = {
  secretKey: process.env.STRIPE_TOKEN,
  pricePro: process.env.STRIPE_PRICE_PRO,
  priceTeam: process.env.STRIPE_PRICE_TEAM,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};

async function validate() {
  console.log('🔍 Starting Stripe Production Validation...');

  if (!config.secretKey) {
    console.error('❌ STRIPE_TOKEN is missing');
    process.exit(1);
  }

  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2024-04-10',
  });

  try {
    // 1. Verify Secret Key by fetching Account Info
    const account = await stripe.accounts.retrieve();
    console.log(`✅ Stripe Connection Verified: ${account.email} (${account.id})`);
    
    const isLive = config.secretKey.startsWith('sk_live') || config.secretKey.startsWith('rk_live');
    console.log(`📍 Mode: ${isLive ? 'LIVE' : 'TEST'}`);

    // 2. Verify Price IDs
    const prices = [
      { id: config.pricePro || 'price_1RRs6SKpOLoEYWXF4fD7W3bC', name: 'PRO' },
      { id: config.priceTeam || 'price_1RRs7BKpOLoEYWXFi4H4i4H4', name: 'TEAM' }
    ];

    for (const price of prices) {
      if (!price.id) {
        console.error(`❌ STRIPE_PRICE_${price.name} is missing (and no default)`);
        continue;
      }
      try {
        const p = await stripe.prices.retrieve(price.id);
        if (p.active) {
          console.log(`✅ Price ${price.name} (${price.id}) is ACTIVE. Amount: ${(p.unit_amount || 0) / 100} ${p.currency.toUpperCase()}`);
        } else {
          console.warn(`⚠️ Price ${price.name} (${price.id}) exists but is INACTIVE`);
        }
      } catch (e) {
        console.error(`❌ Price ${price.name} (${price.id}) NOT FOUND or INVALID: ${e.message}`);
      }
    }

    // 3. Webhook Secret Format Check
    if (!config.webhookSecret) {
      console.warn('⚠️ STRIPE_WEBHOOK_SECRET is missing');
    } else if (!config.webhookSecret.startsWith('whsec_')) {
      console.error('❌ STRIPE_WEBHOOK_SECRET format is invalid (should start with whsec_)');
    } else {
      console.log('✅ STRIPE_WEBHOOK_SECRET format looks valid');
    }

  } catch (error) {
    console.error('❌ Stripe Validation Failed:', error.message);
    process.exit(1);
  }
}

validate();
