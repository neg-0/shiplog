import OpenAI from 'openai';
import { logError, logInfo } from '../lib/logger.js';

import {
  buildCustomerMessages,
  buildDeveloperMessages,
  buildStakeholderMessages,
} from './prompts/index.js';

export interface ReleaseInput {
  tagName: string;
  previousTag?: string;
  releaseBody?: string; // Original GitHub release body
  commits: Array<{
    sha: string;
    message: string;
    author: string;
  }>;
  pullRequests: Array<{
    number: number;
    title: string;
    body?: string;
    labels: string[];
    author: string;
  }>;
  repoConfig: {
    companyName?: string;
    productName?: string;
    customerTone?: string;
  };
}

export interface GeneratedNotes {
  customer: string;
  developer: string;
  stakeholder: string;
  tokensUsed: number;
  model: string;
}

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return new OpenAI({ apiKey });
}

async function generateWithRetry<T>(
  action: () => Promise<T>,
  retries = 3,
  backoff = 1000
): Promise<T> {
  try {
    return await action();
  } catch (error: any) {
    if (retries <= 0) {
      throw error;
    }

    const isRetryable =
      (error instanceof OpenAI.APIError &&
      (error.status === 429 || (error.status && error.status >= 500))) ||
      error.code === 'ETIMEDOUT';

    if (!isRetryable) {
      throw error;
    }

    logError('OpenAI error, retrying...', {
      retriesLeft: retries,
      backoff,
      status: error.status,
      code: error.code
    });

    await new Promise((resolve) => setTimeout(resolve, backoff));
    return generateWithRetry(action, retries - 1, backoff * 2);
  }
}

async function generateOne(args: {
  client: OpenAI;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}) {
  const res = await generateWithRetry(() => args.client.chat.completions.create({
    model: args.model,
    messages: args.messages,
    temperature: 0.4,
  }));

  const content = res.choices?.[0]?.message?.content ?? '';

  if (!content) {
    throw new Error('OpenAI returned empty content');
  }

  const tokens = res.usage?.total_tokens ?? 0;

  return { content, tokens, model: res.model ?? args.model };
}

/**
 * Generate three audience-specific markdown release notes from GitHub release + diff data.
 *
 * @description
 * This function orchestrates the generation of release notes for three distinct audiences:
 * 1. Customer: Non-technical, value-focused.
 * 2. Developer: Technical, implementation details.
 * 3. Stakeholder: Business impact, metrics.
 *
 * It uses the OpenAI API to generate the content in parallel.
 *
 * @param input - The input data containing release info, commits, PRs, and repo configuration.
 * @returns A promise that resolves to `GeneratedNotes` containing the generated text for each audience and usage stats.
 * @throws Error if the OpenAI API key is missing or the request fails.
 */
export async function generateReleaseNotes(input: ReleaseInput): Promise<GeneratedNotes> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  try {
    const [customer, developer, stakeholder] = await Promise.all([
      generateOne({ client, model, messages: buildCustomerMessages(input) }),
      generateOne({ client, model, messages: buildDeveloperMessages(input) }),
      generateOne({ client, model, messages: buildStakeholderMessages(input) }),
    ]);

    return {
      customer: customer.content.trim(),
      developer: developer.content.trim(),
      stakeholder: stakeholder.content.trim(),
      tokensUsed: customer.tokens + developer.tokens + stakeholder.tokens,
      model,
    };
  } catch (error) {
    logError('Failed to generate release notes', { tagName: input.tagName }, error);
    throw error;
  }
}
