import { jest, describe, it, expect } from '@jest/globals';
import { prisma } from './db.js';

describe('Prisma Mock', () => {
  it('should mock prisma calls', async () => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(() => Promise.resolve({ id: '1' }));
    const user = await prisma.user.findUnique({ where: { id: '1' } });
    expect(user).toEqual({ id: '1' });
    expect(prisma.user.findUnique).toHaveBeenCalled();
  });
});
