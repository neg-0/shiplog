// Set necessary environment variables for testing
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
process.env.STRIPE_PRICE_PRO = 'price_pro';
process.env.STRIPE_PRICE_TEAM = 'price_team';
process.env.APP_URL = 'http://localhost:3000';
process.env.JWT_SECRET = 'test_secret';
process.env.NODE_ENV = 'test';
