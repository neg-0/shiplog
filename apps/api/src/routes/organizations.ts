import { Hono } from 'hono';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';

export const organizations = new Hono();

organizations.use('*', requireAuth);

const isAdminRole = (role?: string | null) => role === 'OWNER' || role === 'ADMIN';

// Create organization
organizations.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json() as {
    name: string;
    slug: string;
    githubOrgId?: number;
    githubOrgLogin?: string;
  };

  if (!body.name || !body.slug) {
    return c.json({ error: 'Name and slug are required' }, 400);
  }

  const existing = await prisma.organization.findUnique({
    where: { slug: body.slug },
    select: { id: true },
  });

  if (existing) {
    return c.json({ error: 'Organization slug already exists' }, 400);
  }

  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        githubOrgId: body.githubOrgId ?? null,
        githubOrgLogin: body.githubOrgLogin ?? null,
        ownerId: user.id,
      },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: created.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    return created;
  });

  return c.json(org, 201);
});

// List user's organizations
organizations.get('/', async (c) => {
  const user = c.get('user');

  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    },
    include: {
      _count: {
        select: { members: true, repos: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json({
    organizations: orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      githubOrgId: org.githubOrgId,
      githubOrgLogin: org.githubOrgLogin,
      ownerId: org.ownerId,
      subscriptionId: org.subscriptionId,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      memberCount: org._count.members,
      repoCount: org._count.repos,
    })),
  });
});

// Get organization details
organizations.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const org = await prisma.organization.findFirst({
    where: {
      id,
      OR: [
        { ownerId: user.id },
        { members: { some: { userId: user.id } } },
      ],
    },
    include: {
      owner: {
        select: { id: true, login: true, name: true, email: true, avatarUrl: true },
      },
      members: {
        include: {
          user: {
            select: { id: true, login: true, name: true, email: true, avatarUrl: true },
          },
        },
        orderBy: { joinedAt: 'asc' },
      },
      repos: {
        select: {
          id: true,
          name: true,
          fullName: true,
          status: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    githubOrgId: org.githubOrgId,
    githubOrgLogin: org.githubOrgLogin,
    ownerId: org.ownerId,
    owner: org.owner,
    subscriptionId: org.subscriptionId,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    members: org.members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: member.user,
    })),
    repos: org.repos,
  });
});

// Update organization
organizations.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as {
    name?: string;
    slug?: string;
    githubOrgId?: number | null;
    githubOrgLogin?: string | null;
    subscriptionId?: string | null;
  };

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      members: { where: { userId: user.id } },
    },
  });

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const memberRole = org.members[0]?.role ?? null;
  if (org.ownerId !== user.id && !isAdminRole(memberRole)) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.slug !== undefined) data.slug = body.slug;
  if (body.githubOrgId !== undefined) data.githubOrgId = body.githubOrgId;
  if (body.githubOrgLogin !== undefined) data.githubOrgLogin = body.githubOrgLogin;
  if (body.subscriptionId !== undefined) data.subscriptionId = body.subscriptionId;

  const updated = await prisma.organization.update({
    where: { id },
    data,
  });

  return c.json(updated);
});

// Invite member by email
organizations.post('/:id/invite', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json() as {
    email: string;
    role?: 'OWNER' | 'ADMIN' | 'MEMBER';
    expiresAt?: string;
  };

  if (!body.email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id },
    include: { members: { where: { userId: user.id } } },
  });

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const memberRole = org.members[0]?.role ?? null;
  if (org.ownerId !== user.id && !isAdminRole(memberRole)) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const existingUser = await prisma.user.findFirst({
    where: { email: body.email },
    select: { id: true },
  });

  if (existingUser) {
    const existingMember = await prisma.organizationMember.findFirst({
      where: { organizationId: id, userId: existingUser.id },
      select: { id: true },
    });

    if (existingMember) {
      return c.json({ error: 'User is already a member' }, 400);
    }
  }

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const invite = await prisma.organizationInvite.create({
      data: {
        organizationId: id,
        email: body.email,
        role: body.role ?? 'MEMBER',
        invitedById: user.id,
        expiresAt,
      },
    });

    return c.json(invite, 201);
  } catch (error) {
    return c.json({ error: 'Invite already exists for this email' }, 400);
  }
});

// List organization members
organizations.get('/:id/members', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const member = await prisma.organizationMember.findFirst({
    where: { organizationId: id, userId: user.id },
  });

  if (!member) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: id },
    include: {
      user: {
        select: { id: true, login: true, name: true, email: true, avatarUrl: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return c.json({
    members: members.map((entry) => ({
      id: entry.id,
      role: entry.role,
      joinedAt: entry.joinedAt,
      user: entry.user,
    })),
  });
});

// Remove member
organizations.delete('/:id/members/:userId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const memberId = c.req.param('userId');

  const org = await prisma.organization.findUnique({
    where: { id },
    include: { members: { where: { userId: user.id } } },
  });

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const memberRole = org.members[0]?.role ?? null;
  if (org.ownerId !== user.id && !isAdminRole(memberRole)) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  if (org.ownerId === memberId) {
    return c.json({ error: 'Cannot remove the organization owner' }, 400);
  }

  const existing = await prisma.organizationMember.findFirst({
    where: { organizationId: id, userId: memberId },
  });

  if (!existing) {
    return c.json({ error: 'Member not found' }, 404);
  }

  await prisma.organizationMember.delete({
    where: { id: existing.id },
  });

  return c.json({ removed: true });
});

// Accept invite
organizations.post('/invites/:id/accept', async (c) => {
  const user = c.get('user');
  const inviteId = c.req.param('id');

  const invite = await prisma.organizationInvite.findUnique({
    where: { id: inviteId },
    include: { organization: true },
  });

  if (!invite) {
    return c.json({ error: 'Invite not found' }, 404);
  }

  if (invite.expiresAt < new Date()) {
    return c.json({ error: 'Invite has expired' }, 400);
  }

  if (!user.email || invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return c.json({ error: 'Invite email does not match current user' }, 403);
  }

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: user.id,
      },
    },
    create: {
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
    },
    update: {
      role: invite.role,
    },
  });

  await prisma.organizationInvite.delete({
    where: { id: inviteId },
  });

  return c.json({ accepted: true, organizationId: invite.organizationId });
});
