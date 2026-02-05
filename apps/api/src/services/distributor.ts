/**
 * ShipLog Distribution Service
 * Sends generated notes to configured channels (Slack, Discord, Email, Hosted)
 */

import type { Release } from '@prisma/client';
import type { GeneratedNotes } from './generator.js';

export interface DistributionTarget {
  type: 'slack' | 'discord' | 'email' | 'hosted';
  audience: 'customer' | 'developer' | 'stakeholder';
  webhookUrl?: string; // For Slack/Discord
  email?: string; // For email
  name?: string;
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
 * Distribute release notes to all configured targets
 */
export async function distributeRelease(
  release: Release & { repo?: { fullName: string } },
  notes: GeneratedNotes,
  targets: DistributionTarget[]
): Promise<void> {
  await distributeReleaseWithResults(release, notes, targets);
}

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
    return {
      target: targets[index],
      success: false,
      error: result.reason?.message || 'Promise rejected',
    };
  });
}

/**
 * Distribute release notes to a single target
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

  const response = await fetch(target.webhookUrl, {
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

  const response = await fetch(target.webhookUrl, {
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
}

function truncateForDiscord(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '\n\n*[truncated]*';
}

// ============================================
// EMAIL (via Resend)
// ============================================

async function sendEmail(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  if (!target.email) {
    return { target, success: false, error: 'Missing email' };
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return {
      target,
      success: false,
      error: 'RESEND_API_KEY not configured',
    };
  }

  const audienceLabel =
    target.audience === 'stakeholder'
      ? 'Stakeholder Brief'
      : target.audience === 'developer'
        ? 'Developer Notes'
        : 'Release Notes';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ShipLog <releases@shiplog.io>',
      to: target.email,
      subject: `[${payload.repoFullName}] ${payload.tagName} - ${audienceLabel}`,
      html: markdownToHtml(notes, payload),
    }),
  });

  const responseData = await response.json();

  return {
    target,
    success: response.ok,
    responseCode: response.status,
    error: response.ok ? undefined : JSON.stringify(responseData),
  };
}

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
