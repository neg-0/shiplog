import { jest } from '@jest/globals';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
};

jest.unstable_mockModule('./db', () => ({
  prisma: mockPrisma,
}));

const { prisma } = await import('./db');

describe('Database Mock', () => {
  it('should mock prisma client', async () => {
    const mockUser = { id: 1, login: 'test' };
    (prisma.user.findUnique as jest.Mock<any>).mockResolvedValue(mockUser);

    const user = await prisma.user.findUnique({ where: { id: 1 } });
    expect(user).toEqual(mockUser);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
