import OpenAI from 'openai';

import {
  buildCustomerMessages,
  buildDeveloperMessages,
  buildStakeholderMessages,
} from './prompts';

export interface ReleaseInput {
  tagName: string;
  previousTag?: string;
  releaseBody?: string;
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

async function generateOne(args: {
  client: OpenAI;
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}) {
  const res = await args.client.chat.completions.create({
    model: args.model,
    messages: args.messages,
    temperature: 0.4,
  });

  const content = res.choices?.[0]?.message?.content ?? '';
  const tokens = res.usage?.total_tokens ?? 0;

  return { content, tokens, model: res.model ?? args.model };
}

/**
 * Generate three audience-specific markdown release notes from GitHub release + diff data.
 */
export async function generateReleaseNotes(input: ReleaseInput): Promise<GeneratedNotes> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

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
}
