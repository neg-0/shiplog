import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const repos = await prisma.repo.findMany({
    include: {
      config: {
        include: {
          channels: true
        }
      }
    }
  });
  console.log(JSON.stringify(repos, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
