/**
 * ShipLog Distribution Service
 * Sends generated notes to configured channels (Slack, Discord, Email)
 */

import type { Audience } from '@prisma/client';

interface DistributionTarget {
  type: 'slack' | 'discord' | 'email' | 'webhook';
  audience: Audience;
  destination: string; // webhook URL or email address
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

interface DistributionResult {
  target: DistributionTarget;
  success: boolean;
  error?: string;
  responseCode?: number;
}

/**
 * Distribute release notes to a single target
 */
export async function distributeToTarget(
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
      case 'webhook':
        return await sendToWebhook(target, payload, notes);
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

/**
 * Distribute to all configured targets
 */
export async function distributeToAll(
  targets: DistributionTarget[],
  payload: DistributionPayload
): Promise<DistributionResult[]> {
  const results = await Promise.allSettled(
    targets.map(target => distributeToTarget(target, payload))
  );
  
  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      target: targets[i],
      success: false,
      error: result.reason?.message || 'Promise rejected',
    };
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getNotesForAudience(
  notes: DistributionPayload['notes'],
  audience: Audience
): string {
  switch (audience) {
    case 'CUSTOMER':
      return notes.customer;
    case 'DEVELOPER':
      return notes.developer;
    case 'STAKEHOLDER':
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

  const response = await fetch(target.destination, {
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
  // Discord webhook format
  const discordPayload = {
    embeds: [
      {
        title: `🚀 ${payload.tagName} Released`,
        description: truncateForDiscord(notes),
        color: 0x27ab83, // Teal color
        footer: {
          text: payload.repoFullName,
        },
        url: payload.releaseUrl,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const response = await fetch(target.destination, {
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
  const resendApiKey = process.env.RESEND_API_KEY;
  
  if (!resendApiKey) {
    return {
      target,
      success: false,
      error: 'RESEND_API_KEY not configured',
    };
  }

  const audienceLabel = target.audience === 'STAKEHOLDER' 
    ? 'Stakeholder Brief' 
    : target.audience === 'DEVELOPER' 
    ? 'Developer Notes' 
    : 'Release Notes';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ShipLog <releases@shiplog.io>',
      to: target.destination,
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
  // Basic markdown to HTML conversion
  // In production, use a proper markdown library
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

// ============================================
// GENERIC WEBHOOK
// ============================================

async function sendToWebhook(
  target: DistributionTarget,
  payload: DistributionPayload,
  notes: string
): Promise<DistributionResult> {
  const webhookPayload = {
    event: 'release.published',
    repo: payload.repoFullName,
    tag: payload.tagName,
    url: payload.releaseUrl,
    audience: target.audience.toLowerCase(),
    notes: notes,
    timestamp: new Date().toISOString(),
  };

  const response = await fetch(target.destination, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(webhookPayload),
  });

  return {
    target,
    success: response.ok,
    responseCode: response.status,
    error: response.ok ? undefined : await response.text(),
  };
}
