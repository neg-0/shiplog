import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.repo.update({
    where: { id: 'cmlh4m8ek0007u5t7ic8jlo11' },
    data: { slug: 'shiplog' },
  });
  console.log('Updated slug for neg-0/shiplog:', updated.slug);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
