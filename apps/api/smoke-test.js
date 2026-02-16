import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- SHIPLOG SMOKE TEST ---');
  try {
    const userCount = await prisma.user.count();
    console.log('✅ Prisma connection OK. User count:', userCount);
    
    // Check Stripe config via process.env (passed from shell)
    const stripeSet = !!process.env.STRIPE_SECRET_KEY;
    console.log('Stripe Secret Key set:', stripeSet);
    
    if (!stripeSet) {
      console.error('❌ STRIPE_SECRET_KEY is missing');
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Smoke test failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
