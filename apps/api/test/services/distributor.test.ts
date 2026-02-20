import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { distributeReleaseWithResults } from '../../src/services/distributor';

// Mock logger
jest.mock('../../src/lib/logger.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

const originalFetch = global.fetch;
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Distributor Service', () => {
  beforeAll(() => {
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const mockRelease = {
    tagName: 'v1.0.0',
    htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    repo: { fullName: 'owner/repo' },
  };

  const mockNotes = {
    customer: 'Customer notes',
    developer: 'Developer notes',
    stakeholder: 'Stakeholder notes',
    tokensUsed: 100,
    model: 'gpt-4',
  };

  const mockTargets = [
    { type: 'slack', audience: 'customer', webhookUrl: 'https://hooks.slack.com/services/xxx' },
    { type: 'discord', audience: 'developer', webhookUrl: 'https://discord.com/api/webhooks/xxx' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn<any>().mockResolvedValue({}),
      text: jest.fn<any>().mockResolvedValue('OK'),
    } as any);
  });

  it('should successfully distribute to all targets', async () => {
    const results = await distributeReleaseWithResults(mockRelease as any, mockNotes as any, mockTargets as any);

    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should handle partial failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ // Slack succeeds
        ok: true,
        status: 200,
        json: jest.fn<any>(),
        text: jest.fn<any>().mockResolvedValue('OK')
      } as any)
      .mockResolvedValueOnce({ // Discord fails
        ok: false,
        status: 400,
        text: () => Promise.resolve('Error'),
        json: jest.fn<any>()
      } as any);

    const results = await distributeReleaseWithResults(mockRelease as any, mockNotes as any, mockTargets as any);

    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toBe('Error');
  });

  it('should retry on transient error', async () => {
    mockFetch
      .mockResolvedValueOnce({ // Slack fails 503
        ok: false,
        status: 503,
        text: jest.fn<any>(),
        json: jest.fn<any>()
      } as any)
      .mockResolvedValueOnce({ // Slack retry succeeds
        ok: true,
        status: 200,
        text: jest.fn<any>().mockResolvedValue('OK'),
        json: jest.fn<any>()
      } as any)
      .mockResolvedValueOnce({ // Discord succeeds
        ok: true,
        status: 200,
        text: jest.fn<any>().mockResolvedValue('OK'),
        json: jest.fn<any>()
      } as any);

    const results = await distributeReleaseWithResults(mockRelease as any, mockNotes as any, mockTargets as any);

    expect(results.length).toBe(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial fail + 1 retry + 1 success
  });
});
