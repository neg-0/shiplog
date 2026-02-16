import Stripe from 'stripe';

const config = {
  secretKey: process.env.STRIPE_TOKEN,
};

async function listProducts() {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2024-04-10',
  });

  try {
    const products = await stripe.products.list({ active: true });
    console.log('--- Active Products ---');
    for (const p of products.data) {
      console.log(`- ${p.name} (${p.id})`);
    }
  } catch (error) {
    console.error(error.message);
  }
}

listProducts();
