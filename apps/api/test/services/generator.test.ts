import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import OpenAI from 'openai';

// Mock OpenAI
const mockCreate = jest.fn<any>();

jest.mock('openai', () => {
  const MockOpenAI: any = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));

  MockOpenAI.APIError = class APIError extends Error {
    status: number;
    code?: string;
    constructor(status: number, error: any, message: string, headers?: any) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  };

  return {
    __esModule: true,
    default: MockOpenAI,
  };
});

jest.mock('../../src/lib/logger.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

jest.mock('../../src/services/prompts/index.js', () => ({
  buildCustomerMessages: jest.fn(() => []),
  buildDeveloperMessages: jest.fn(() => []),
  buildStakeholderMessages: jest.fn(() => []),
}));

// Import after mocking
import { generateReleaseNotes } from '../../src/services/generator';

describe('Generator Service', () => {
  const mockInput = {
    tagName: 'v1.0.0',
    commits: [],
    pullRequests: [],
    repoConfig: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';

    // Default successful response
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Generated content' } }],
      usage: { total_tokens: 10 },
      model: 'gpt-4',
    });
  });

  it('should successfully generate notes', async () => {
    const result = await generateReleaseNotes(mockInput as any);

    expect(result.customer).toBe('Generated content');
    expect(result.developer).toBe('Generated content');
    expect(result.stakeholder).toBe('Generated content');
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('should retry on 429 error', async () => {
    // First call fails with 429, subsequent retry succeeds
    const error = new OpenAI.APIError(429, {} as any, 'Rate limit', {});

    mockCreate
      .mockRejectedValueOnce(error) // Fail first call
      .mockResolvedValue({ // Succeed on retry
        choices: [{ message: { content: 'Retry content' } }],
        usage: { total_tokens: 10 },
        model: 'gpt-4',
      });

    const result = await generateReleaseNotes(mockInput as any);

    // One of them should be 'Retry content'
    const values = [result.customer, result.developer, result.stakeholder];
    expect(values).toContain('Retry content');

    // Should be called 4 times (3 initial + 1 retry)
    expect(mockCreate).toHaveBeenCalledTimes(4);
  });

  it('should fail after max retries', async () => {
    const error = new OpenAI.APIError(500, {} as any, 'Server error', {});

    mockCreate.mockRejectedValue(error);

    await expect(generateReleaseNotes(mockInput as any)).rejects.toThrow('Server error');

    // 3 parallel calls * (1 initial + 3 retries) = 12 calls total.
    // However, Promise.all fails fast, so we might see fewer calls if one fails earlier.
    expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(4);
  }, 10000); // Increase timeout for retries
});
