const { PrismaClient } = require('@prisma/client');
try {
  const prisma = new PrismaClient();
  console.log('Prisma initialized successfully');
} catch (e) {
  console.error('Prisma initialization failed:', e.message);
}
