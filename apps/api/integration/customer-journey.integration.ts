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
const { signToken } = await import('../src/lib/jwt.js');
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

test('organization members can read but only admins can change a repository', async () => {
  const owner = await prisma.user.create({
    data: { githubId: 1601, login: 'team-owner', accessToken: 'local-fixture', subscriptionTier: 'TEAM' },
  });
  const member = await prisma.user.create({
    data: { githubId: 1602, login: 'team-member', accessToken: 'local-fixture', subscriptionTier: 'TEAM' },
  });
  const admin = await prisma.user.create({
    data: { githubId: 1603, login: 'team-admin', accessToken: 'local-fixture', subscriptionTier: 'TEAM' },
  });
  const organization = await prisma.organization.create({
    data: {
      name: 'Journey Team', slug: 'journey-team', ownerId: owner.id,
      members: { create: [
        { userId: owner.id, role: 'OWNER' },
        { userId: member.id, role: 'MEMBER' },
        { userId: admin.id, role: 'ADMIN' },
      ] },
    },
  });
  // The MEMBER originally connected this repository. That must not grant an
  // ownership bypass after it becomes an organization repository.
  const repo = await prisma.repo.create({
    data: {
      githubId: 1801, name: 'team-repo', fullName: 'team-owner/team-repo', owner: 'team-owner',
      userId: member.id, organizationId: organization.id, isPublic: false,
      config: { create: { autoGenerate: false } },
      releases: { create: {
        githubId: 1901, tagName: 'v1.0.0', htmlUrl: 'https://github.com/team-owner/team-repo/releases/tag/v1.0.0',
        status: 'READY', publishedAt: new Date('2026-09-01T12:00:00Z'),
        notes: { create: { customer: 'Customer note', developer: 'Developer note', stakeholder: 'Stakeholder note' } },
      } },
    },
    include: { releases: true },
  });
  const releaseId = repo.releases[0].id;
  const config = await prisma.repoConfig.findUniqueOrThrow({ where: { repoId: repo.id } });
  const channel = await prisma.channel.create({
    data: {
      configId: config.id, name: 'Private Slack', type: 'SLACK', audience: 'CUSTOMER',
      webhookUrl: 'https://hooks.slack.com/services/local-fixture-secret',
    },
  });
  await prisma.emailRecipient.create({
    data: { configId: config.id, email: 'private-recipient@example.test', audience: 'STAKEHOLDER' },
  });
  const memberHeaders = { Authorization: `Bearer ${await signToken(member.id)}`, 'Content-Type': 'application/json' };
  const adminHeaders = { Authorization: `Bearer ${await signToken(admin.id)}`, 'Content-Type': 'application/json' };

  const list = await app.request('/repos', { headers: memberHeaders });
  expect(list.status).toBe(200);
  expect((await list.json() as { repos: { id: string }[] }).repos).toEqual(expect.arrayContaining([{ id: repo.id, githubId: 1801, name: 'team-repo', fullName: 'team-owner/team-repo', description: null, status: 'PENDING', lastRelease: 'v1.0.0', lastReleaseDate: expect.any(String) }]));
  const details = await app.request(`/repos/${repo.id}`, { headers: memberHeaders });
  expect(details.status).toBe(200);
  const detailsBody = await details.json();
  expect(detailsBody).toMatchObject({ id: repo.id, canManage: false, config: { channels: [{ id: channel.id, name: 'Private Slack', type: 'SLACK', audience: 'CUSTOMER', enabled: true }] } });
  expect(JSON.stringify(detailsBody)).not.toContain('local-fixture-secret');
  expect(JSON.stringify(detailsBody)).not.toContain('private-recipient@example.test');
  expect(detailsBody.config.emailRecipients).toBeUndefined();
  const memberRelease = await app.request(`/releases/${releaseId}`, { headers: memberHeaders });
  expect(memberRelease.status).toBe(200);
  expect(await memberRelease.json()).toMatchObject({ id: releaseId, repo: { id: repo.id, canManage: false } });

  const memberSettings = await app.request(`/repos/${repo.id}/settings`, {
    method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ publicTitle: 'Unauthorized change' }),
  });
  expect(memberSettings.status).toBe(404);
  expect((await app.request(`/repos/${repo.id}/config`, {
    method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ productName: 'Unauthorized change' }),
  })).status).toBe(404);
  expect((await app.request(`/repos/${repo.id}/channels`, {
    method: 'POST', headers: memberHeaders,
    body: JSON.stringify({ name: 'Second channel', type: 'SLACK', audience: 'CUSTOMER', webhookUrl: 'https://hooks.slack.com/services/local-fixture-new' }),
  })).status).toBe(404);
  expect((await app.request(`/repos/${repo.id}/channels/${channel.id}`, {
    method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ enabled: false }),
  })).status).toBe(404);
  expect((await app.request(`/repos/${repo.id}/channels/${channel.id}`, {
    method: 'DELETE', headers: memberHeaders, body: '{}',
  })).status).toBe(404);
  expect((await app.request(`/releases/${releaseId}/publish`, {
    method: 'POST', headers: memberHeaders, body: JSON.stringify({ channels: [] }),
  })).status).toBe(404);
  expect((await app.request(`/repos/${repo.id}/import`, {
    method: 'POST', headers: memberHeaders, body: '{}',
  })).status).toBe(404);
  expect((await app.request(`/repos/${repo.id}`, { method: 'DELETE', headers: memberHeaders, body: '{}' })).status).toBe(404);
  expect(await prisma.repo.findUnique({ where: { id: repo.id }, select: { publicTitle: true } })).toEqual({ publicTitle: null });
  expect(await prisma.channel.findUnique({ where: { id: channel.id }, select: { enabled: true } })).toEqual({ enabled: true });
  expect(await prisma.distribution.count({ where: { releaseId } })).toBe(0);

  const adminSettings = await app.request(`/repos/${repo.id}/settings`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ publicTitle: 'Team release notes' }),
  });
  expect(adminSettings.status).toBe(200);
  expect(await prisma.repo.findUnique({ where: { id: repo.id }, select: { publicTitle: true } })).toEqual({ publicTitle: 'Team release notes' });
  const adminDetails = await app.request(`/repos/${repo.id}`, { headers: adminHeaders });
  expect(adminDetails.status).toBe(200);
  expect(await adminDetails.json()).toMatchObject({ id: repo.id, canManage: true });
  const adminRelease = await app.request(`/releases/${releaseId}`, { headers: adminHeaders });
  expect(adminRelease.status).toBe(200);
  expect(await adminRelease.json()).toMatchObject({ id: releaseId, repo: { id: repo.id, canManage: true } });
  expect(outboundRequests).toEqual(['https://github.com/login/oauth/access_token', 'https://api.github.com/user']);
}, 15_000);

test('admin operational views query real PostgreSQL and remain private', async () => {
  const operator = await prisma.user.create({
    data: { githubId: 2601, login: 'journey-operator', email: 'admin@example.test', accessToken: 'local-fixture' },
  });
  const headers = { Authorization: `Bearer ${await signToken(operator.id)}` };
  const metrics = await app.request('/admin/metrics', { headers });
  expect(metrics.status).toBe(200);
  expect(metrics.headers.get('Cache-Control')).toContain('no-store');
  expect(await metrics.json()).toMatchObject({
    users: { total: expect.any(Number) },
    billing: { mrr: null, collectedRevenue: null },
  });

  const users = await app.request('/admin/users?limit=10', { headers });
  expect(users.status).toBe(200);
  expect(await users.json()).toMatchObject({
    users: expect.arrayContaining([expect.objectContaining({ id: operator.id, login: 'journey-operator', repoCount: 0, releaseCount: 0, externalDeliveryCount: 0 })]),
  });
  const teams = await app.request('/admin/organizations', { headers });
  expect(teams.status).toBe(200);
  expect(await teams.json()).toMatchObject({ organizations: expect.arrayContaining([expect.objectContaining({ name: 'Journey Team' })]) });
}, 15_000);
