import { jest, describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import type { Context, Next } from 'hono';

// Spy on console.log
const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { logger, requestLogger, setLoggerContext } = await import('./logger.js');

describe('Logger', () => {
  beforeEach(() => {
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  it('should log info messages as JSON', () => {
    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalled();
    const logCall = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logCall.level).toBe('info');
    expect(logCall.message).toBe('test message');
    expect(logCall.timestamp).toBeDefined();
  });

  it('should include context in logs', async () => {
    const mockNext: Next = jest.fn<any>().mockResolvedValue(undefined);
    const mockContext = {
      req: {
        method: 'GET',
        path: '/test',
        header: jest.fn(),
      },
      res: {
        status: 200,
      },
      set: jest.fn(),
      get: jest.fn(),
    } as unknown as Context;

    await requestLogger(mockContext, async () => {
      logger.info('inside middleware');
      setLoggerContext({ userId: 'user-123' });
      logger.info('with user');
    });

    expect(consoleSpy).toHaveBeenCalledTimes(4);

    const call2 = JSON.parse(consoleSpy.mock.calls[1][0] as string);
    expect(call2.message).toBe('inside middleware');
    expect(call2.requestId).toBeDefined();

    const call3 = JSON.parse(consoleSpy.mock.calls[2][0] as string);
    expect(call3.message).toBe('with user');
    expect(call3.userId).toBe('user-123');
    expect(call3.requestId).toBeDefined();
  });
});
