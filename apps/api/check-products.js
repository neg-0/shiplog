import Stripe from 'stripe';

const config = {
  secretKey: process.env.STRIPE_TOKEN,
};

async function check() {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2024-04-10',
  });

  const products = ['prod_TvCdX6y8oKXSei', 'prod_TvCczlRSi1uqh'];
  for (const pid of products) {
     try {
       const p = await stripe.products.retrieve(pid);
       console.log(`Product: ${p.name} (${p.id})`);
     } catch (e) {
       console.log(`Error retrieving ${pid}: ${e.message}`);
     }
  }
}

check();
