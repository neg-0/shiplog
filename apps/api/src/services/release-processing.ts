import { randomUUID } from 'node:crypto';
import type { Release, ReleaseStatus } from '@prisma/client';
import { prisma } from '../lib/db.js';

export const DELIVERY_REVIEW_PREFIX = 'Delivery outcome needs review.';
export const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;
const MARKER_PREFIX = 'shiplog-processing:v1';
type Operation = 'generation' | 'publication';
type ProcessingRelease = Pick<Release, 'id' | 'status' | 'error' | 'updatedAt'>;
const publicStatuses: ReleaseStatus[] = ['PUBLISHED', 'PARTIAL_SUCCESS'];

export function needsDeliveryReview(error: string | null | undefined): boolean {
  return Boolean(error?.startsWith(DELIVERY_REVIEW_PREFIX));
}

export function processingWhere(id: string, marker: string) {
  return { id, status: 'PROCESSING' as const, error: marker };
}

/** Claim the exact observed state, including any delivery-review marker. */
export async function claimProcessing(release: ProcessingRelease, operation: Operation): Promise<string | null> {
  if (release.status === 'PROCESSING' || needsDeliveryReview(release.error)) return null;
  const marker = `${MARKER_PREFIX}:${operation}:${release.status}:${randomUUID()}`;
  const claimed = await prisma.release.updateMany({
    where: {
      id: release.id, status: release.status,
      error: release.error ?? null, updatedAt: release.updatedAt,
    },
    data: { status: 'PROCESSING', error: marker },
  });
  return claimed.count ? marker : null;
}

/** Expired claims cannot be left permanently busy after a restart. Publication is never replayed. */
export async function recoverInterruptedProcessing<T extends ProcessingRelease>(release: T): Promise<T> {
  if (release.status !== 'PROCESSING' || !release.updatedAt ||
      Date.now() - release.updatedAt.getTime() < PROCESSING_TIMEOUT_MS) return release;

  const parts = release.error?.split(':');
  const known = parts?.slice(0, 2).join(':') === MARKER_PREFIX;
  const operation = known ? parts?.[2] : undefined;
  const previousStatus = known ? parts?.[3] as ReleaseStatus : undefined;
  const status = previousStatus && publicStatuses.includes(previousStatus) ? previousStatus : 'FAILED';
  const error = operation === 'generation'
    ? 'Generation was interrupted. Generate the notes again to retry.'
    : `${DELIVERY_REVIEW_PREFIX} Publication was interrupted. Contact support to check destinations before retrying.`;
  const updatedAt = new Date();
  const recovered = await prisma.release.updateMany({
    where: { id: release.id, status: 'PROCESSING', error: release.error ?? null, updatedAt: release.updatedAt },
    data: { status, error, updatedAt },
  });
  return recovered.count ? { ...release, status, error, updatedAt } : release;
}

export async function failProcessing(release: ProcessingRelease, marker: string, error: unknown, operation: Operation) {
  const uncertain = operation === 'publication' && error instanceof Error && error.name === 'PublicationOutcomeUnknown';
  const status = publicStatuses.includes(release.status) ? release.status :
    operation === 'generation' || uncertain ? 'FAILED' : release.status;
  await prisma.release.updateMany({
    where: processingWhere(release.id, marker),
    data: {
      status,
      error: uncertain ? (error as Error).message :
        operation === 'generation' ? 'Failed to generate notes. Please try again.' : release.error ?? null,
    },
  });
}
