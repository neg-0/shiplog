import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { distributeRelease, distributeReleaseWithResults, DistributionTarget } from '../distributor.js';
import type { GeneratedNotes } from '../generator.js';
import type { Release } from '@prisma/client';

// Suppress logger output during tests
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('distributeRelease', () => {
  const mockFetch = jest.fn<any>();
  global.fetch = mockFetch as any;

  const release: Release & { repo?: { fullName: string } } = {
    id: '1',
    repoId: 'r1',
    githubId: 100,
    tagName: 'v1.0.0',
    name: 'Release v1.0.0',
    body: 'Body',
    htmlUrl: 'https://github.com/owner/repo/releases/tag/v1.0.0',
    isDraft: false,
    isPrerelease: false,
    publishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'READY',
    processedAt: null,
    error: null,
    repo: { fullName: 'owner/repo' },
  };

  const notes: GeneratedNotes = {
    customer: 'Customer notes',
    developer: 'Developer notes',
    stakeholder: 'Stakeholder notes',
    tokensUsed: 100,
    model: 'gpt-4',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    });
    process.env.SENDGRID_API_KEY = 'test-sendgrid-key';
  });

  afterEach(() => {
    delete process.env.SENDGRID_API_KEY;
  });

  // SLACK tests
  it('should return error for slack if webhook url is missing', async () => {
    const targets: DistributionTarget[] = [{ type: 'slack', audience: 'customer' }];
    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Missing webhookUrl');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should send to slack if configured', async () => {
    const targets: DistributionTarget[] = [
      { type: 'slack', audience: 'customer', webhookUrl: 'https://hooks.slack.com/services/xxx' },
    ];

    await distributeRelease(release, notes, targets);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/xxx',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Customer notes'),
      })
    );
  });

  // DISCORD tests
  it('should return error for discord if webhook url is missing', async () => {
    const targets: DistributionTarget[] = [{ type: 'discord', audience: 'developer' }];
    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Missing webhookUrl');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should send to discord if configured', async () => {
    const targets: DistributionTarget[] = [
      { type: 'discord', audience: 'developer', webhookUrl: 'https://discord.com/api/webhooks/xxx' },
    ];

    await distributeRelease(release, notes, targets);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/xxx',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('Developer notes'),
      })
    );
  });

  // EMAIL tests
  it('should return error for email if address is missing', async () => {
    const targets: DistributionTarget[] = [{ type: 'email', audience: 'stakeholder' }];
    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Missing email');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return error for email if SENDGRID_API_KEY is missing', async () => {
    delete process.env.SENDGRID_API_KEY;
    const targets: DistributionTarget[] = [{ type: 'email', audience: 'stakeholder', email: 'boss@example.com' }];
    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('SENDGRID_API_KEY not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should send email if configured', async () => {
    const targets: DistributionTarget[] = [
      { type: 'email', audience: 'stakeholder', email: 'boss@example.com' },
    ];

    await distributeRelease(release, notes, targets);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.sendgrid.com/v3/mail/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-sendgrid-key',
        }),
        body: expect.stringContaining('Stakeholder notes'),
      })
    );
  });

  // HOSTED tests
  it('should handle hosted target (no-op)', async () => {
    const targets: DistributionTarget[] = [{ type: 'hosted', audience: 'customer' }];
    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(true);
    expect(results[0].responseCode).toBe(204);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ERROR HANDLING
  it('should handle fetch errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const targets: DistributionTarget[] = [
      { type: 'slack', audience: 'customer', webhookUrl: 'https://hooks.slack.com/services/xxx' },
    ];

    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(false);
    expect(results[0].outcomeUnknown).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  }, 60000);

  it('should handle API errors (non-200)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'Internal Server Error',
    });

    const targets: DistributionTarget[] = [
      { type: 'slack', audience: 'customer', webhookUrl: 'https://hooks.slack.com/services/xxx' },
    ];

    const results = await distributeReleaseWithResults(release, notes, targets);

    expect(results[0].success).toBe(false);
    expect(results[0].responseCode).toBe(500);
    expect(results[0].error).toBe('Internal Server Error');
    expect(results[0].outcomeUnknown).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  }, 60000);

  it('reports legacy generic webhooks as unsupported without making a request', async () => {
    const results = await distributeReleaseWithResults(release, notes, [{ type: 'webhook', audience: 'customer', webhookUrl: 'https://example.com/hook' }]);
    expect(results[0]).toMatchObject({ success: false, error: 'Generic webhooks are not supported. Choose Slack or Discord.' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('escapes untrusted HTML in emailed release notes', async () => {
    await distributeReleaseWithResults(release, { ...notes, customer: '<img src=x onerror=alert(1)> **Safe title**' }, [
      { type: 'email', audience: 'customer', email: 'recipient@example.com' },
    ]);
    const emailBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    const html = emailBody.content.find((content: any) => content.type === 'text/html').value;
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
    expect(html).toContain('<strong>Safe title</strong>');
  });

  it.each([
    'https://hooks.slack.com.evil.example/services/x',
    'https://127.0.0.1/services/x',
    'https://private.railway.internal/services/x',
    'https://user:password@hooks.slack.com/services/x',
    'https://hooks.slack.com:8443/services/x',
  ])('rejects an untrusted webhook destination before sending: %s', async (webhookUrl) => {
    const results = await distributeReleaseWithResults(release, notes, [{ type: 'slack', audience: 'customer', webhookUrl }]);
    expect(results[0].success).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never follows redirects that could send notes to another host', async () => {
    await distributeReleaseWithResults(release, notes, [{ type: 'discord', audience: 'customer', webhookUrl: 'https://discord.com/api/webhooks/xxx' }]);
    expect(mockFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error' }));
  });

  it('keeps explicit rate-limit rejection retryable without automatic sends', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const results = await distributeReleaseWithResults(release, notes, [{ type: 'slack', audience: 'customer', webhookUrl: 'https://hooks.slack.com/services/xxx' }]);
    expect(results[0]).toMatchObject({ success: false, outcomeUnknown: false, responseCode: 429 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

});
