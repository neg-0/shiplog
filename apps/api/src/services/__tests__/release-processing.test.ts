import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const updateMany = jest.fn<any>();
jest.unstable_mockModule('../../lib/db.js', () => ({ prisma: { release: { updateMany } } }));
const { claimProcessing, failProcessing, recoverInterruptedProcessing, PROCESSING_TIMEOUT_MS } = await import('../release-processing.js');
let stored: any;
const snapshot = () => ({ ...stored });

describe('release processing claims', () => {
  beforeEach(() => {
    updateMany.mockReset();
    stored = { id: 'release-1', status: 'PUBLISHED', error: null, updatedAt: new Date(1000) };
    updateMany.mockImplementation(async ({ where, data }: any) => {
      const matches = Object.entries(where).every(([key, value]) => value instanceof Date
        ? stored[key]?.getTime() === value.getTime() : stored[key] === value);
      if (!matches) return { count: 0 };
      stored = { ...stored, ...data, updatedAt: data.updatedAt ?? new Date() };
      return { count: 1 };
    });
  });

  it.each(['PUBLISHED', 'PARTIAL_SUCCESS'])('a stale %s request cannot overwrite a new review marker', async status => {
    stored.status = status;
    const observed = snapshot();
    const marker = await claimProcessing(observed, 'publication');
    expect(marker).toContain(`:publication:${status}:`);
    const error = Object.assign(new Error('Delivery outcome needs review. May already have arrived.'), { name: 'PublicationOutcomeUnknown' });
    await failProcessing(observed, marker!, error, 'publication');
    expect(stored.status).toBe(status);
    expect(await claimProcessing(observed, 'publication')).toBeNull();
    expect(await claimProcessing(observed, 'generation')).toBeNull();
    expect(stored.error).toBe(error.message);
  });

  it('does not accept an already processing or review-needed snapshot', async () => {
    expect(await claimProcessing({ ...stored, status: 'PROCESSING' }, 'generation')).toBeNull();
    expect(await claimProcessing({ ...stored, error: 'Delivery outcome needs review.' }, 'publication')).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('recovers interrupted generation and fences late failures from the expired worker', async () => {
    stored.status = 'PENDING';
    const original = snapshot();
    const oldMarker = await claimProcessing(original, 'generation');
    stored.updatedAt = new Date(Date.now() - PROCESSING_TIMEOUT_MS - 1);
    const recovered = await recoverInterruptedProcessing(snapshot());
    expect(recovered.status).toBe('FAILED');
    expect(recovered.error).toContain('Generation was interrupted');
    const newMarker = await claimProcessing(recovered, 'generation');
    expect(newMarker).not.toBe(oldMarker);
    await failProcessing(original, oldMarker!, new Error('Old worker failed'), 'generation');
    expect(stored.error).toBe(newMarker);
    expect(stored.status).toBe('PROCESSING');
  });

  it.each([null, 'shiplog-processing:v1:publication:READY:old'])('holds unknown or interrupted publication for review', async error => {
    stored = { ...stored, status: 'PROCESSING', error, updatedAt: new Date(Date.now() - PROCESSING_TIMEOUT_MS - 1) };
    const recovered = await recoverInterruptedProcessing(snapshot());
    expect(recovered).toMatchObject({ status: 'FAILED', error: expect.stringContaining('Delivery outcome needs review.') });
    expect(await claimProcessing(recovered, 'publication')).toBeNull();
  });

  it('retains prior public status when interrupted publication is held', async () => {
    stored = { ...stored, status: 'PROCESSING', error: 'shiplog-processing:v1:publication:PUBLISHED:old', updatedAt: new Date(0) };
    expect(await recoverInterruptedProcessing(snapshot())).toMatchObject({ status: 'PUBLISHED', error: expect.stringContaining('Delivery outcome needs review.') });
  });

  it('does not recover a fresh claim or overwrite a concurrently completed claim', async () => {
    stored = { ...stored, status: 'PROCESSING', error: 'shiplog-processing:v1:generation:PENDING:old', updatedAt: new Date() };
    expect((await recoverInterruptedProcessing(snapshot())).status).toBe('PROCESSING');
    expect(updateMany).not.toHaveBeenCalled();
    stored.updatedAt = new Date(0);
    const expired = snapshot();
    stored = { ...stored, status: 'READY', error: null, updatedAt: new Date() };
    await recoverInterruptedProcessing(expired);
    expect(stored.status).toBe('READY');
  });
});
