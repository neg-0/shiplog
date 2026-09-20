/**
 * ShipLog Distribution Service
 * Sends generated notes to configured channels (Slack, Discord, Email, Hosted)
 */

import type { Release } from '@prisma/client';
import type { GeneratedNotes } from './generator.js';
import { logError, logInfo } from '../lib/logger.js';

export interface DistributionTarget {
  type: 'slack' | 'discord' | 'email' | 'hosted' | 'webhook';
  audience: 'customer' | 'developer' | 'stakeholder';
  webhookUrl?: string; // For Slack/Discord
  email?: string; // For email
  name?: string;
  channelId?: string; // Optional channel ID for tracking
  emailRecipientId?: string; // Optional recipient ID for tracking
}

interface DistributionPayload {
  repoFullName: string;
  tagName: string;
  releaseUrl: string;
  notes: {
    customer: string;
    developer: string;
    stakeholder: string;
  };
}

export interface DistributionResult {
  target: DistributionTarget;
  success: boolean;
  error?: string;
  responseCode?: number;
  outcomeUnknown?: boolean;
}

// ============================================
// SECURITY HELPERS
// ============================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function validateWebhookUrl(url: string, provider: 'slack' | 'discord'): void {
  const parsed = new URL(url);
  const hosts = provider === 'slack' ? ['hooks.slack.com', 'hooks.slack-gov.com'] : ['discord.com', 'discordapp.com'];
  const pathValid = provider === 'slack' ? parsed.pathname.startsWith('/services/') : /^\/api\/(?:v\d+\/)?webhooks\//.test(parsed.pathname);
  if (parsed.protocol !== 'https:' || !hosts.includes(parsed.hostname) ||
      !pathValid || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) {
    throw new Error(`Use an official ${provider === 'slack' ? 'Slack' : 'Discord'} HTTPS webhook URL.`);
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Distribute release notes to all configured targets (Slack, Discord, Email, etc.).
 *
 * @param release - The release entity from the database, including optional repo information.
 * @param notes - The generated release notes (customer, developer, stakeholder versions).
 * @param targets - An array of distribution targets configured for the repository.
 * @returns A promise that resolves to the distribution results for each target.
 */
export async function distributeRelease(
  release: Release & { repo?: { fullName: string } },
  notes: Pick<GeneratedNotes, 'customer' | 'developer' | 'stakeholder'>,
  targets: DistributionTarget[]
): Promise<DistributionResult[]> {
  return distributeReleaseWithResults(release, notes, targets);
}

/**
 * Distribute release notes and return detailed results for each target.
 *
 * @param release - The release entity from the database.
 * @param notes - The generated release notes.
 * @param targets - An array of distribution targets.
 * @returns A promise that resolves to an array of `DistributionResult` objects indicating success or failure for each target.
 */
export async function distributeReleaseWithResults(
  release: Release & { repo?: { fullName: string } },
  notes: Pick<GeneratedNotes, 'customer' | 'developer' | 'stakeholder'>,
  targets: DistributionTarget[]
): Promise<DistributionResult[]> {
  const payload: DistributionPayload = {
    repoFullName: release.repo?.fullName ?? 'unknown',
    tagName: release.tagName,
    releaseUrl: (release as any).htmlUrl ?? '',
    notes: {
      customer: notes.customer,
      developer: notes.developer,
      stakeholder: notes.stakeholder,
    },
  };

  const results = await Promise.allSettled(
    targets.map((target) => distributeToTarget(target, payload))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    logError('Distribution target failed unexpectedly', { target: sanitizeTarget(targets[index]) }, result.reason);
    const target = targets[index];
    if (!target) {
      throw new Error('Target not found for result');
    }
    return {
      target,
      success: false,
      error: result.reason?.message || 'Promise rejected',
    };
  });
}

/**
 * Distribute release notes to a single specific target.
 */
async function distributeToTarget(
  target: DistributionTarget,
  payload: DistributionPayload
): Promise<DistributionResult> {
  const notes = getNotesForAudience(payload.notes, target.audience);

  try {
    switch (target.type) {
      case 'webhook':
        return { target, success: false, error: 'Generic webhooks are not supported. Choose Slack or Discord.' };
      case 'slack':
        return await sendToSlack(target, payload, notes);
      case 'discord':
        return await sendToDiscord(target, payload, notes);
      case 'email':
        return await sendEmail(target, payload, notes);
      case 'hosted':
        return {
          target,
          success: true,
          responseCode: 204,
        };
      default:
        return { target, success: false, error: 'Unknown target type' };
    }
  } catch (error) {
    logError('Error distributing to target', { target: sanitizeTarget(target) }, error);
    return {
      target,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function sanitizeTarget(target: DistributionTarget): Omit<DistributionTarget, 'webhookUrl'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { webhookUrl, ...rest } = target;
  return rest;
}

function getNotesForAudience(
  notes: DistributionPayload['notes'],
  audience: DistributionTarget['audience']
): string {
  switch (audience) {
    case 'customer':
      return notes.customer;
    case 'developer':
      return notes.developer;
    case 'stakeholder':
      return notes.stakeholder;
    default:
      return notes.customer;
  }
}

// A POST may have been accepted even when its response is lost. Never retry it
// automatically, and never follow a webhook redirect to another destination.
async function sendOnce(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, { ...options, redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// SLACK
// ============================================

async function sendToSlack(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.webhookUrl) {
    return { target, success: false, error: 'Missing webhookUrl' };
  }

  validateWebhookUrl(target.webhookUrl, 'slack');

  const slackPayload = {
    text: `New Release: ${payload.repoFullName} ${payload.tagName}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${payload.tagName} Released`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: truncateForSlack(notes),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${payload.releaseUrl}|View on GitHub> • ${payload.repoFullName}`,
          },
        ],
      },
    ],
  };

  try {
    const response = await sendOnce(target.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    return {
      target,
      success: response.ok,
      responseCode: response.status,
      outcomeUnknown: response.status >= 500,
      error: response.ok ? undefined : await response.text(),
    };
  } catch (error) {
    return {
      target,
      success: false,
      outcomeUnknown: true,
      error: 'Delivery outcome is unknown after a network failure. Contact support before retrying.',
    };
  }
}

function truncateForSlack(text: string, maxLength = 2900): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n_[truncated - see full notes on GitHub]_';
}

// ============================================
// DISCORD
// ============================================

async function sendToDiscord(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.webhookUrl) {
    return { target, success: false, error: 'Missing webhookUrl' };
  }

  validateWebhookUrl(target.webhookUrl, 'discord');

  const discordPayload = {
    content: `${payload.repoFullName} ${payload.tagName} released`,
    embeds: [
      {
        title: `${payload.tagName} Released`,
        description: truncateForDiscord(notes),
        color: 0x27ab83,
        footer: {
          text: payload.repoFullName,
        },
        url: payload.releaseUrl,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const response = await sendOnce(target.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
    });

    return {
      target,
      success: response.ok,
      responseCode: response.status,
      outcomeUnknown: response.status >= 500,
      error: response.ok ? undefined : await response.text(),
    };
  } catch (error) {
    return {
      target,
      success: false,
      outcomeUnknown: true,
      error: 'Delivery outcome is unknown after a network failure. Contact support before retrying.',
    };
  }
}

function truncateForDiscord(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n*[truncated]*';
}

// ============================================
// EMAIL (via SendGrid)
// ============================================

async function sendEmail(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.email) {
    return { target, success: false, error: 'Missing email' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(target.email)) {
    return { target, success: false, error: 'Invalid email format' };
  }

  const sendGridApiKey = process.env.SENDGRID_API_KEY;

  if (!sendGridApiKey) {
    return {
      target,
      success: false,
      error: 'SENDGRID_API_KEY not configured',
    };
  }

  const audienceLabel =
    target.audience === 'stakeholder'
      ? 'Stakeholder Brief'
      : target.audience === 'developer'
        ? 'Developer Notes'
        : 'Release Notes';

  try {
    const emailPayload = {
      personalizations: [
        {
          to: [{ email: target.email }],
          subject: `[${payload.repoFullName}] ${payload.tagName} - ${audienceLabel}`,
        },
      ],
      from: { email: 'noreply@shiplog.io', name: 'ShipLog' },
      content: [
        {
          type: 'text/html',
          value: markdownToHtml(notes, payload),
        },
      ],
    };

    const response = await sendOnce('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendGridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    // SendGrid returns 202 on success with empty body
    const responseData = response.status === 202 ? null : await response.json().catch(() => null);

    return {
      target,
      success: response.ok,
      responseCode: response.status,
      outcomeUnknown: response.status >= 500,
      error: response.ok ? undefined : (responseData ? JSON.stringify(responseData) : 'SendGrid API error'),
    };
  } catch (error) {
    return {
      target,
      success: false,
      outcomeUnknown: true,
      error: 'Delivery outcome is unknown after a network failure. Contact support before retrying.',
    };
  }
}

/**
 * Convert Markdown release notes to HTML for email distribution.
 */
function markdownToHtml(markdown: string, payload: DistributionPayload): string {
  const safeTagName = escapeHtml(payload.tagName);
  const safeRepoFullName = escapeHtml(payload.repoFullName);

  const html = escapeHtml(markdown)
    .replace(/^### (.+)$/gm, '<h3 style="color: #102a43; margin-top: 16px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #102a43; margin-top: 20px;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background: #f0f4f8; padding: 2px 4px; border-radius: 4px;">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="color: #334e68;">$1</li>')
    .replace(/\n\n/g, '<br/><br/>');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #102a43; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${safeTagName}</h1>
        <p style="color: #9fb3c8; margin: 8px 0 0 0;">${safeRepoFullName}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
        ${html}
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #627d98; font-size: 14px;">
          <a href="${escapeHtml(payload.releaseUrl)}" style="color: #27ab83;">View on GitHub</a> •
          Powered by <a href="https://shiplog.io" style="color: #27ab83;">ShipLog</a>
        </p>
      </div>
    </div>
  `;
}
