import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const repos = await prisma.repo.findMany({
    where: {
      isPublic: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      fullName: true,
    },
  });
  console.log(JSON.stringify(repos, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
