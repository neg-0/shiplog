import { jest, test, expect, afterAll } from '@jest/globals';

// The runner always creates this disposable database. Reject ordinary/dev/prod URLs.
const databaseUrl = new URL(process.env.DATABASE_URL || 'http://invalid');
if (process.env.SHIPLOG_LOCAL_JOURNEY !== '1' || databaseUrl.protocol !== 'postgresql:' ||
    databaseUrl.hostname !== '127.0.0.1' || databaseUrl.username !== 'shiplog_journey' ||
    databaseUrl.pathname !== '/shiplog_journey' || !databaseUrl.port) {
  throw new Error('Run only through scripts/test-local-journey.mjs with its disposable local database.');
}

const githubRelease = {
  id: 901, tag_name: 'v1.0.0', name: 'First release', body: 'A useful improvement.',
  html_url: 'https://github.com/journey-owner/journey-repo/releases/tag/v1.0.0',
  draft: false, prerelease: false, published_at: '2026-09-01T12:00:00Z', created_at: '2026-09-01T12:00:00Z',
};
const githubRepo = { id: 801, name: 'journey-repo', full_name: 'journey-owner/journey-repo', owner: { login: 'journey-owner' }, description: 'Local fixture' };
const generateNotes = jest.fn<any>().mockResolvedValue({
  customer: 'Customer value.', developer: 'Developer detail.', stakeholder: 'Stakeholder outcome.',
  tokensUsed: 30, model: 'local-fixture',
});
jest.unstable_mockModule('../src/services/github.js', () => ({
  getRepository: jest.fn<any>().mockResolvedValue(githubRepo),
  listUserRepos: jest.fn<any>().mockResolvedValue([{ ...githubRepo, owner: 'journey-owner' }]),
  createWebhook: jest.fn<any>().mockResolvedValue({ id: 701 }),
  deleteWebhook: jest.fn<any>().mockResolvedValue(undefined),
  listReleases: jest.fn<any>().mockResolvedValue([githubRelease]),
  fetchReleaseData: jest.fn<any>().mockResolvedValue({
    release: {
      id: githubRelease.id, tagName: githubRelease.tag_name, name: githubRelease.name,
      body: githubRelease.body, htmlUrl: githubRelease.html_url, isDraft: false, isPrerelease: false,
      publishedAt: new Date(githubRelease.published_at),
    },
    previousTag: null, commits: [], pullRequests: [],
  }),
}));
jest.unstable_mockModule('../src/services/generator.js', () => ({ generateReleaseNotes: generateNotes }));

const outboundRequests: string[] = [];
globalThis.fetch = jest.fn<any>(async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  outboundRequests.push(url);
  if (url === 'https://github.com/login/oauth/access_token') return Response.json({ access_token: 'local-fake-github-token' });
  if (url === 'https://api.github.com/user') return Response.json({ id: 601, login: 'journey-owner', name: 'Journey User', email: 'journey@example.test' });
  throw new Error(`Unexpected outbound network request blocked: ${url}`);
}) as typeof fetch;

const { app } = await import('../src/app.js');
const { prisma } = await import('../src/lib/db.js');
afterAll(async () => { await prisma.$disconnect(); });

test('OAuth to reviewed, private-then-public hosted changelog with real database persistence', async () => {
  expect((await app.request('/user/me')).status).toBe(401);
  const start = await app.request('/auth/github');
  expect(start.status).toBe(302);
  const oauthUrl = new URL(start.headers.get('location')!);
  const state = oauthUrl.searchParams.get('state')!;
  const callback = await app.request(`/auth/github/callback?code=local-code&state=${state}`, {
    headers: { Cookie: `oauth_state=${state}` },
  });
  expect(callback.status).toBe(302);
  const code = new URL(callback.headers.get('location')!).searchParams.get('code')!;
  const exchange = await app.request('/auth/exchange', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
  });
  expect(exchange.status).toBe(200);
  const cookies = exchange.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
  expect(cookies).toContain('shiplog_session=');
  const headers = { Cookie: cookies, 'Content-Type': 'application/json' };
  const profile = await app.request('/user/me', { headers });
  expect(profile.status).toBe(200);
  expect(await profile.json()).toMatchObject({ login: 'journey-owner', subscriptionTier: 'FREE' });

  const connected = await app.request('/repos/connect', {
    method: 'POST', headers,
    body: JSON.stringify({ githubId: githubRepo.id, owner: 'journey-owner', repo: 'journey-repo', fullName: githubRepo.full_name }),
  });
  expect(connected.status).toBe(200);
  const repoId = (await connected.json() as { id: string }).id;
  let imported;
  for (let attempt = 0; attempt < 100; attempt++) {
    imported = await prisma.release.findFirst({ where: { repoId } });
    if (imported?.status === 'SKIPPED') break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  expect(imported?.status).toBe('SKIPPED');
  expect(generateNotes).not.toHaveBeenCalled();
  const releaseId = imported!.id;
  const generated = await app.request(`/releases/${releaseId}/regenerate`, { method: 'POST', headers, body: '{}' });
  expect(generated.status).toBe(200);
  expect(generateNotes).toHaveBeenCalledTimes(1);
  expect(await prisma.generatedNotes.findUnique({ where: { releaseId } })).toMatchObject({
    customer: 'Customer value.', developer: 'Developer detail.', stakeholder: 'Stakeholder outcome.',
  });

  const edited = await app.request(`/releases/${releaseId}/notes`, {
    method: 'PATCH', headers, body: JSON.stringify({ customer: '**Reviewed** customer value.' }),
  });
  expect(edited.status).toBe(200);
  expect(await prisma.generatedNotes.findUnique({ where: { releaseId } })).toMatchObject({ customerEdited: true, customer: '**Reviewed** customer value.' });
  const published = await app.request(`/releases/${releaseId}/publish`, { method: 'POST', headers, body: JSON.stringify({ channels: [] }) });
  expect(published.status).toBe(200);
  expect(await published.json()).toMatchObject({ status: 'published', failedCount: 0, distributedTo: 3 });
  expect(await prisma.distribution.count({ where: { releaseId, status: 'SENT', hostedChangelog: true } })).toBe(3);

  const settings = await app.request(`/repos/${repoId}/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({ slug: 'local-journey', isPublic: false }),
  });
  expect(settings.status).toBe(200);
  expect((await app.request('/public/local-journey')).status).toBe(404);
  const makePublic = await app.request(`/repos/${repoId}/settings`, {
    method: 'PATCH', headers, body: JSON.stringify({ isPublic: true }),
  });
  expect(makePublic.status).toBe(200);
  const publicPage = await app.request('/public/local-journey');
  expect(publicPage.status).toBe(200);
  expect(await publicPage.json()).toMatchObject({
    releases: [{ version: 'v1.0.0', notes: { customer: '**Reviewed** customer value.', developer: 'Developer detail.', stakeholder: 'Stakeholder outcome.' } }],
  });
  expect(outboundRequests).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user']);
}, 15_000);
