import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { mockDeep, mockReset } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

const prisma = mockDeep<PrismaClient>();
const distribute = jest.fn<any>();
jest.unstable_mockModule('../../lib/db.js', () => ({ prisma }));
jest.unstable_mockModule('../distributor.js', () => ({ distributeReleaseWithResults: distribute }));
const { publishReleaseNotes } = await import('../publisher.js');

const release = {
  id: 'release-1', tagName: 'v1.0.0', htmlUrl: 'https://github.com/acme/app/releases/v1.0.0',
  notes: { customer: 'Customers', developer: 'Developers', stakeholder: 'Stakeholders' },
  repo: {
    fullName: 'acme/app',
    config: {
      channels: [
        { id: 'slack-1', type: 'SLACK', enabled: true, audience: 'CUSTOMER', name: 'News', webhookUrl: 'https://hooks.slack.com/test' },
        { id: 'discord-1', type: 'DISCORD', enabled: false, audience: 'DEVELOPER', name: 'Disabled', webhookUrl: 'https://discord.com/test' },
      ],
      emailRecipients: [{ id: 'email-1', enabled: true, audience: 'STAKEHOLDER', email: 'owner@example.com' }],
    },
  },
} as any;

describe('publishReleaseNotes', () => {
  beforeEach(() => {
    mockReset(prisma);
    distribute.mockReset();
    prisma.distribution.findMany.mockResolvedValue([]);
    distribute.mockImplementation(async (_release: unknown, _notes: unknown, targets: any[]) =>
      targets.map(target => ({ target, success: true, responseCode: 204 }))
    );
  });

  it('sends selected enabled channels and records hosted publication', async () => {
    const result = await publishReleaseNotes(release, ['slack-1']);
    const targets = distribute.mock.calls[0][2];
    expect(targets).toHaveLength(4);
    expect(targets).toContainEqual(expect.objectContaining({ type: 'slack', channelId: 'slack-1' }));
    expect(targets.some((target: any) => target.type === 'email' || target.type === 'discord')).toBe(false);
    expect(prisma.distribution.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ channelId: 'slack-1', status: 'SENT', releaseId: 'release-1' }),
      expect.objectContaining({ hostedChangelog: true, status: 'SENT' }),
    ]) });
    expect(result).toEqual({ status: 'PUBLISHED', failedCount: 0, distributedTo: 4 });
  });

  it('publishes only to the hosted changelog for an explicit empty selection', async () => {
    await publishReleaseNotes(release, []);
    expect(distribute.mock.calls[0][2]).toEqual([
      { type: 'hosted', audience: 'customer' },
      { type: 'hosted', audience: 'developer' },
      { type: 'hosted', audience: 'stakeholder' },
    ]);
  });

  it('autopublish includes enabled email recipients', async () => {
    await publishReleaseNotes(release);
    expect(distribute.mock.calls[0][2]).toContainEqual(expect.objectContaining({ type: 'email', emailRecipientId: 'email-1' }));
  });

  it('reports failed delivery as partial success instead of published', async () => {
    distribute.mockImplementation(async (_release: unknown, _notes: unknown, targets: any[]) =>
      targets.map(target => ({ target, success: target.type !== 'slack', error: target.type === 'slack' ? 'Channel unavailable' : undefined }))
    );
    expect(await publishReleaseNotes(release, ['slack-1'])).toEqual({ status: 'PARTIAL_SUCCESS', failedCount: 1, distributedTo: 3 });
    expect(prisma.release.update).toHaveBeenCalledWith({ where: { id: 'release-1' }, data: { status: 'PARTIAL_SUCCESS', error: null } });
    expect(prisma.distribution.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ channelId: 'slack-1', status: 'FAILED', error: 'Channel unavailable' }),
    ]) });
  });

  it('retries only failed targets without resending prior successful deliveries', async () => {
    prisma.distribution.findMany.mockResolvedValue([
      { channelId: 'slack-1', audience: 'CUSTOMER', hostedChangelog: false },
      { audience: 'CUSTOMER', hostedChangelog: true },
      { audience: 'DEVELOPER', hostedChangelog: true },
      { audience: 'STAKEHOLDER', hostedChangelog: true },
    ] as any);
    await publishReleaseNotes(release);
    expect(distribute.mock.calls[0][2]).toEqual([expect.objectContaining({ type: 'email', emailRecipientId: 'email-1' })]);
  });

  it('marks an uncertain outcome when sending succeeds but delivery records cannot be saved', async () => {
    prisma.distribution.createMany.mockRejectedValue(new Error('Database unavailable'));
    await expect(publishReleaseNotes(release, ['slack-1'])).rejects.toMatchObject({
      name: 'PublicationOutcomeUnknown', message: expect.stringContaining('Delivery outcome needs review.'),
    });
    expect(prisma.release.update).not.toHaveBeenCalled();
  });

});
