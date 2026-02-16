import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_TOKEN;

if (!stripeSecret) {
  process.exit(1);
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: '2024-04-10',
});

async function validate() {
  try {
    const webhooks = await stripe.webhookEndpoints.list();
    console.log('--- Webhook Endpoints ---');
    if (webhooks.data.length === 0) {
      console.log('None found.');
    } else {
      for (const wh of webhooks.data) {
        console.log(`- URL: ${wh.url} | Status: ${wh.status} | Events: ${wh.enabled_events.join(', ')}`);
      }
    }
  } catch (error) {
    console.error(error.message);
  }
}

validate();
