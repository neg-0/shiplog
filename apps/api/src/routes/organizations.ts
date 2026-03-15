import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { validate } from '../lib/validation.js';
import { apiLimiter } from '../lib/rate-limit.js';

/**
 * @module organizations
 * @description Routes for managing organizations and memberships.
 */
export const organizations = new Hono();

organizations.use('*', requireAuth);
organizations.use('*', apiLimiter);

const isAdminRole = (role?: string | null) => role === 'OWNER' || role === 'ADMIN';

const createOrgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  githubOrgId: z.number().optional(),
  githubOrgLogin: z.string().optional(),
});

/**
 * POST /
 * @description Create a new organization.
 * @body {string} name - Organization name.
 * @body {string} slug - Unique slug for the organization.
 * @body {number} [githubOrgId] - Optional GitHub Organization ID.
 * @body {string} [githubOrgLogin] - Optional GitHub Organization Login.
 * @returns {object} The created organization.
 * @throws 400 if name or slug is missing or slug already exists.
 */
organizations.post('/', validate(createOrgSchema), async (c) => {
  const user = c.get('user');
  const body = c.req.valid('json');

  const existing = await prisma.organization.findUnique({
    where: { slug: body.slug },
    select: { id: true },
  });

  if (existing) {
    return c.json({ error: 'Organization slug already exists' }, 400);
  }

  const org = await prisma.$transaction(async (tx: any) => {
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

/**
 * GET /
 * @description List all organizations the user belongs to.
 * @returns {object} Array of organizations with member and repo counts.
 */
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
    organizations: orgs.map((org: any) => ({
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

/**
 * GET /:id
 * @description Get details for a specific organization including members and repos.
 * @param {string} id - Organization UUID.
 * @returns {object} Organization details.
 * @throws 404 if not found.
 */
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

  // Only OWNER/ADMIN can see member emails
  const callerMember = org.members.find((m: any) => m.user.id === user.id);
  const callerRole = callerMember?.role ?? (org.ownerId === user.id ? 'OWNER' : null);
  const canSeeEmails = callerRole === 'OWNER' || callerRole === 'ADMIN';

  function stripEmail(u: { id: string; login: string; name: string | null; email: string | null; avatarUrl: string | null }) {
    if (canSeeEmails) return u;
    const { email: _email, ...rest } = u;
    return rest;
  }

  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    githubOrgId: org.githubOrgId,
    githubOrgLogin: org.githubOrgLogin,
    ownerId: org.ownerId,
    owner: stripEmail(org.owner),
    subscriptionId: org.subscriptionId,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
    members: org.members.map((member: any) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      user: stripEmail(member.user),
    })),
    repos: org.repos,
  });
});

const updateOrgSchema = z.object({
  name: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  githubOrgId: z.number().nullable().optional(),
  githubOrgLogin: z.string().nullable().optional(),
  // subscriptionId intentionally excluded — managed by billing system only
});

/**
 * PATCH /:id
 * @description Update an organization's details.
 * @param {string} id - Organization UUID.
 * @body {string} [name] - New name.
 * @body {string} [slug] - New slug.
 * @returns {object} Updated organization.
 * @throws 403 if user is not an owner/admin.
 */
organizations.patch('/:id', validate(updateOrgSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = c.req.valid('json');

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

  // Check slug uniqueness if updating
  if (body.slug && body.slug !== org.slug) {
    const existing = await prisma.organization.findUnique({
      where: { slug: body.slug },
      select: { id: true },
    });
    if (existing) {
      return c.json({ error: 'Organization slug already exists' }, 400);
    }
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: body,
  });

  return c.json(updated);
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional(),
  expiresAt: z.string().datetime().optional(),
});

/**
 * POST /:id/invite
 * @description Invite a user to the organization by email.
 * @param {string} id - Organization UUID.
 * @body {string} email - Email address to invite.
 * @body {string} [role=MEMBER] - Role to assign (OWNER, ADMIN, MEMBER).
 * @returns {object} Created invite.
 * @throws 403 if user is not an owner/admin.
 * @throws 400 if user is already a member.
 */
organizations.post('/:id/invite', validate(inviteSchema), async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  if (!id) return c.json({ error: 'Missing organization ID' }, 400);
  const body = c.req.valid('json');

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

  // Prevent role escalation: ADMINs cannot grant OWNER role
  if (memberRole === 'ADMIN' && body.role === 'OWNER') {
    return c.json({ error: 'Admins cannot grant owner role' }, 403);
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

/**
 * GET /:id/members
 * @description List members of an organization.
 * @param {string} id - Organization UUID.
 * @returns {object} Array of members.
 * @throws 403 if user is not a member.
 */
organizations.get('/:id/members', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const member = await prisma.organizationMember.findFirst({
    where: { organizationId: id, userId: user.id },
  });

  if (!member) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const canSeeEmails = member.role === 'OWNER' || member.role === 'ADMIN';

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
    members: members.map((entry: any) => {
      const { email: _email, ...userWithoutEmail } = entry.user;
      return {
        id: entry.id,
        role: entry.role,
        joinedAt: entry.joinedAt,
        user: canSeeEmails ? entry.user : userWithoutEmail,
      };
    }),
  });
});

/**
 * DELETE /:id/members/:userId
 * @description Remove a member from the organization.
 * @param {string} id - Organization UUID.
 * @param {string} userId - User UUID to remove.
 * @returns {object} Success message.
 * @throws 403 if user is not an owner/admin.
 * @throws 400 if trying to remove the owner.
 */
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

/**
 * POST /invites/:id/accept
 * @description Accept an organization invite.
 * @param {string} id - Invite UUID.
 * @returns {object} Success message and organization ID.
 * @throws 404 if invite not found.
 * @throws 400 if invite expired.
 * @throws 403 if email doesn't match.
 */
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
