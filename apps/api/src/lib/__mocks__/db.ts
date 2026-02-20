import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

export const prisma = mockDeep<PrismaClient>();
export type MockPrisma = DeepMockProxy<PrismaClient>;
export default prisma;
