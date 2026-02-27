import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'dustin@negativezeroinc.com';
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, stripeCustomerId: true, subscriptionTier: true }
  });

  if (!user) {
    console.log(`User ${email} not found.`);
  } else {
    console.log('User found:', JSON.stringify(user, null, 2));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
