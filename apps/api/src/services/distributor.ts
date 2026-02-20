/**
 * ShipLog Distribution Service
 * Sends generated notes to configured channels (Slack, Discord, Email, Hosted)
 */

import type { Release } from '@prisma/client';
import type { GeneratedNotes } from './generator.js';
import { logError, logInfo } from '../lib/logger.js';

export interface DistributionTarget {
  type: 'slack' | 'discord' | 'email' | 'hosted';
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
}

/**
 * Distribute release notes to all configured targets (Slack, Discord, Email, etc.).
 *
 * @description
 * Orchestrates the distribution process by calling `distributeReleaseWithResults` but ignoring the detailed results.
 *
 * @param release - The release entity from the database, including optional repo information.
 * @param notes - The generated release notes (customer, developer, stakeholder versions).
 * @param targets - An array of distribution targets configured for the repository.
 * @returns A promise that resolves when all distribution attempts have completed.
 */
export async function distributeRelease(
  release: Release & { repo?: { fullName: string } },
  notes: GeneratedNotes,
  targets: DistributionTarget[]
): Promise<void> {
  await distributeReleaseWithResults(release, notes, targets);
}

/**
 * Distribute release notes and return detailed results for each target.
 *
 * @description
 * Prepares the payload and iterates through all targets, attempting distribution in parallel (via `Promise.allSettled`).
 *
 * @param release - The release entity from the database.
 * @param notes - The generated release notes.
 * @param targets - An array of distribution targets.
 * @returns A promise that resolves to an array of `DistributionResult` objects indicating success or failure for each target.
 */
export async function distributeReleaseWithResults(
  release: Release & { repo?: { fullName: string } },
  notes: GeneratedNotes,
  targets: DistributionTarget[]
): Promise<DistributionResult[]> {
  const payload: DistributionPayload = {
    repoFullName: release.repo?.fullName ?? 'unknown',
    tagName: release.tagName,
    releaseUrl: release.htmlUrl,
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
 *
 * @description
 * Routes the distribution to the appropriate handler (Slack, Discord, Email) based on the target type.
 * Also selects the appropriate version of the notes based on the target audience.
 *
 * @param target - The distribution target configuration.
 * @param payload - The data payload containing release info and notes.
 * @returns A promise that resolves to the result of the distribution attempt.
 */
async function distributeToTarget(
  target: DistributionTarget,
  payload: DistributionPayload
): Promise<DistributionResult> {
  const notes = getNotesForAudience(payload.notes, target.audience);

  try {
    switch (target.type) {
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
    logError('Error distributing to target', { target: sanitizeTarget(target), payload }, error);
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

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  backoff = 1000
): Promise<Response> {
  const safeUrl = url.includes('hooks.slack.com') || url.includes('discord.com')
    ? url.split('/').slice(0, 3).join('/') + '/...'
    : url;

  try {
    const response = await fetch(url, options);

    if (response.ok) return response;

    // Retry on 5xx or 429
    if (retries > 0 && (response.status === 429 || response.status >= 500)) {
      logInfo(`Retrying request to ${safeUrl} (status ${response.status})`, { retriesLeft: retries });
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }

    return response;
  } catch (error) {
     if (retries > 0) {
       logInfo(`Retrying request to ${safeUrl} (network error)`, { retriesLeft: retries, error });
       await new Promise((resolve) => setTimeout(resolve, backoff));
       return fetchWithRetry(url, options, retries - 1, backoff * 2);
     }
     throw error;
  }
}


// ============================================
// SLACK
// ============================================

/**
 * Send release notes to a Slack channel via webhook.
 *
 * @param target - The distribution target containing the webhook URL.
 * @param payload - The release payload.
 * @param notes - The release notes formatted for Slack (although passed as string, Slack uses `mrkdwn`).
 * @returns A promise that resolves to the distribution result.
 */
async function sendToSlack(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.webhookUrl) {
    return { target, success: false, error: 'Missing webhookUrl' };
  }

  const slackPayload = {
    text: `🚀 New Release: ${payload.repoFullName} ${payload.tagName}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🚀 ${payload.tagName} Released`,
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
    const response = await fetchWithRetry(target.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    return {
      target,
      success: response.ok,
      responseCode: response.status,
      error: response.ok ? undefined : await response.text(),
    };
  } catch (error) {
    return {
      target,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown network error',
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

/**
 * Send release notes to a Discord channel via webhook.
 *
 * @param target - The distribution target containing the webhook URL.
 * @param payload - The release payload.
 * @param notes - The release notes.
 * @returns A promise that resolves to the distribution result.
 */
async function sendToDiscord(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.webhookUrl) {
    return { target, success: false, error: 'Missing webhookUrl' };
  }

  const discordPayload = {
    content: `🚀 ${payload.repoFullName} ${payload.tagName} released`,
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
    const response = await fetchWithRetry(target.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
    });

    return {
      target,
      success: response.ok,
      responseCode: response.status,
      error: response.ok ? undefined : await response.text(),
    };
  } catch (error) {
    return {
      target,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown network error',
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

/**
 * Send release notes via email using SendGrid.
 *
 * @param target - The distribution target containing the recipient email.
 * @param payload - The release payload.
 * @param notes - The release notes (Markdown format).
 * @returns A promise that resolves to the distribution result.
 */
async function sendEmail(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.email) {
    return { target, success: false, error: 'Missing email' };
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
      from: { email: 'noreply@negativezeroinc.com', name: 'ShipLog' },
      content: [
        {
          type: 'text/html',
          value: markdownToHtml(notes, payload),
        },
      ],
    };

    const response = await fetchWithRetry('https://api.sendgrid.com/v3/mail/send', {
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
      error: response.ok ? undefined : (responseData ? JSON.stringify(responseData) : 'SendGrid API error'),
    };
  } catch (error) {
    return {
      target,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown network error',
    };
  }
}

/**
 * Convert Markdown release notes to HTML for email distribution.
 *
 * @description
 * Applies basic styling and structure to the Markdown content.
 *
 * @param markdown - The release notes in Markdown format.
 * @param payload - The release payload for context.
 * @returns An HTML string ready for email sending.
 */
function markdownToHtml(markdown: string, payload: DistributionPayload): string {
  let html = markdown
    .replace(/^### (.+)$/gm, '<h3 style="color: #102a43; margin-top: 16px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: #102a43; margin-top: 20px;">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background: #f0f4f8; padding: 2px 4px; border-radius: 4px;">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="color: #334e68;">$1</li>')
    .replace(/\n\n/g, '<br/><br/>');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #102a43; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🚀 ${payload.tagName}</h1>
        <p style="color: #9fb3c8; margin: 8px 0 0 0;">${payload.repoFullName}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
        ${html}
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #627d98; font-size: 14px;">
          <a href="${payload.releaseUrl}" style="color: #27ab83;">View on GitHub</a> •
          Powered by <a href="https://shiplog.io" style="color: #27ab83;">ShipLog</a>
        </p>
      </div>
    </div>
  `;
}
