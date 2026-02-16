import Stripe from 'stripe';

const config = {
  secretKey: process.env.STRIPE_TOKEN,
};

async function list() {
  if (!config.secretKey) {
    console.error('❌ STRIPE_TOKEN is missing');
    process.exit(1);
  }

  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2024-04-10',
  });

  try {
    const prices = await stripe.prices.list({ active: true, limit: 10 });
    console.log('--- Active Prices ---');
    for (const p of prices.data) {
      console.log(`- ID: ${p.id} | Amount: ${(p.unit_amount || 0) / 100} ${p.currency.toUpperCase()} | Product: ${p.product}`);
    }
  } catch (error) {
    console.error(error.message);
  }
}

list();
