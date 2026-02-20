import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { ReleaseInput } from '../generator.js';

// Mock OpenAI
const mockCreate = jest.fn();

jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

// Dynamic import after mocking
const { generateReleaseNotes } = await import('../generator.js');

describe('generateReleaseNotes', () => {
  const input: ReleaseInput = {
    tagName: 'v1.0.0',
    commits: [
      { sha: 'sha1', message: 'feat: new feature', author: 'dev1' },
      { sha: 'sha2', message: 'fix: bug fix', author: 'dev2' },
    ],
    pullRequests: [
      { number: 1, title: 'Feature 1', labels: ['feat'], author: 'dev1' },
    ],
    repoConfig: {
      companyName: 'Acme',
      productName: 'Widget',
    },
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    mockCreate.mockReset();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it('should throw error if OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(generateReleaseNotes(input)).rejects.toThrow('OPENAI_API_KEY is not set');
  });

  it('should generate notes for all audiences', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Generated note' } }],
      usage: { total_tokens: 100 },
      model: 'gpt-4o-mini',
    });

    const result = await generateReleaseNotes(input);

    expect(result.customer).toBe('Generated note');
    expect(result.developer).toBe('Generated note');
    expect(result.stakeholder).toBe('Generated note');
    expect(result.tokensUsed).toBe(300);
    expect(result.model).toBe('gpt-4o-mini');

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('should use configured model if set', async () => {
    process.env.OPENAI_MODEL = 'gpt-4-turbo';

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Note' } }],
      usage: { total_tokens: 50 },
      model: 'gpt-4-turbo',
    });

    const result = await generateReleaseNotes(input);
    expect(result.model).toBe('gpt-4-turbo');
  });

  it('should handle API errors gracefully', async () => {
    mockCreate.mockRejectedValue(new Error('API Error'));
    await expect(generateReleaseNotes(input)).rejects.toThrow('API Error');
  });

  it('should handle empty choices or content', async () => {
    mockCreate.mockResolvedValue({
      choices: [],
      usage: { total_tokens: 0 },
      model: 'gpt-4o-mini',
    });

    const result = await generateReleaseNotes(input);
    expect(result.customer).toBe('');
    expect(result.tokensUsed).toBe(0);
  });
});
