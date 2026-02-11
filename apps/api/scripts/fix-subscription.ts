import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'dustin@negativezeroinc.com';
  console.log(`Updating subscription for ${email}...`);
  
  const updated = await prisma.user.updateMany({
    where: { email },
    data: { 
      stripeCustomerId: 'cus_TxJ0IF49F2I763',
      subscriptionTier: 'PRO',
      subscriptionStatus: 'active'
    }
  });

  console.log(`Updated ${updated.count} user(s).`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
