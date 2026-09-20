import type { Channel, EmailRecipient, GeneratedNotes, Release } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { DELIVERY_REVIEW_PREFIX, processingWhere } from './release-processing.js';
import { distributeReleaseWithResults, type DistributionTarget } from './distributor.js';

type PublishableRelease = Release & {
  notes: GeneratedNotes;
  repo: {
    fullName: string;
    config: { channels: Channel[]; emailRecipients: EmailRecipient[] } | null;
  };
};

/** Publish reviewed notes, recording failures and skipping targets already delivered. */
export async function publishReleaseNotes(release: PublishableRelease, channelIds: string[] | undefined, marker: string) {
  const targets: DistributionTarget[] = [];
  for (const channel of release.repo.config?.channels ?? []) {
    if (!channel.enabled || (channelIds && !channelIds.includes(channel.id))) continue;
    targets.push({
      type: channel.type.toLowerCase() as DistributionTarget['type'],
      audience: channel.audience.toLowerCase() as DistributionTarget['audience'],
      webhookUrl: channel.webhookUrl,
      name: channel.name,
      channelId: channel.id,
    });
  }
  // An explicit channel selection must not notify unselected email recipients.
  if (channelIds === undefined) {
    for (const recipient of release.repo.config?.emailRecipients ?? []) {
      if (!recipient.enabled) continue;
      targets.push({
        type: 'email',
        audience: recipient.audience.toLowerCase() as DistributionTarget['audience'],
        email: recipient.email,
        name: recipient.name ?? undefined,
        emailRecipientId: recipient.id,
      });
    }
  }
  for (const audience of ['customer', 'developer', 'stakeholder'] as const) {
    targets.push({ type: 'hosted', audience });
  }

  const sent = await prisma.distribution.findMany({
    where: { releaseId: release.id, status: 'SENT' },
    select: { channelId: true, emailRecipientId: true, hostedChangelog: true, audience: true },
  });
  const pendingTargets = targets.filter(target => !sent.some(delivery =>
    delivery.audience.toLowerCase() === target.audience && (
      (target.channelId && delivery.channelId === target.channelId) ||
      (target.emailRecipientId && delivery.emailRecipientId === target.emailRecipientId) ||
      (target.type === 'hosted' && delivery.hostedChangelog)
    )
  ));
  const results = await distributeReleaseWithResults(release, release.notes, pendingTargets);
  if (results.length) {
    try {
      await prisma.distribution.createMany({
        data: results.map(result => ({
          releaseId: release.id,
          audience: result.target.audience.toUpperCase() as 'CUSTOMER' | 'DEVELOPER' | 'STAKEHOLDER',
          channelId: result.target.channelId,
          emailRecipientId: result.target.emailRecipientId,
          hostedChangelog: result.target.type === 'hosted',
          status: result.success ? 'SENT' : 'FAILED',
          sentAt: result.success ? new Date() : undefined,
          error: result.success ? undefined : result.error,
          responseCode: result.responseCode,
        })),
      });
    } catch (error) {
      if (results.some(result => result.outcomeUnknown || (result.success && result.target.type !== 'hosted'))) {
        const uncertain = new Error(`${DELIVERY_REVIEW_PREFIX} A destination may have received these notes, but its delivery record could not be saved. Contact support before retrying.`);
        uncertain.name = 'PublicationOutcomeUnknown';
        throw uncertain;
      }
      throw error;
    }
  }
  if (results.some(result => result.outcomeUnknown)) {
    const uncertain = new Error(`${DELIVERY_REVIEW_PREFIX} A destination may have received these notes without confirming delivery. Contact support before retrying.`);
    uncertain.name = 'PublicationOutcomeUnknown';
    throw uncertain;
  }
  const failedCount = results.filter(result => !result.success).length;
  const status = failedCount ? 'PARTIAL_SUCCESS' : 'PUBLISHED';
  await prisma.release.update({ where: processingWhere(release.id, marker), data: { status, error: null } });
  return { status, failedCount, distributedTo: results.filter(result => result.success).length };
}
