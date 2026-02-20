import {
  updateUserSchema,
  githubCallbackSchema,
  connectRepoSchema,
  updateRepoConfigSchema,
  updateRepoSettingsSchema,
  createChannelSchema,
  updateChannelSchema,
  checkoutSchema,
  regenerateNotesSchema,
  publishReleaseSchema,
  updateNotesSchema,
  updateUserAdminSchema,
} from '../src/lib/schemas';
import { Hono } from 'hono';
import { auth } from '../src/routes/auth';

describe('Validation Schemas', () => {
  describe('User Schemas', () => {
    it('updateUserSchema validates name', () => {
      expect(updateUserSchema.parse({ name: 'Valid Name' })).toEqual({ name: 'Valid Name' });
      expect(() => updateUserSchema.parse({ name: '' })).toThrow();
      expect(updateUserSchema.parse({})).toEqual({});
    });
  });

  describe('Auth Schemas', () => {
    it('githubCallbackSchema requires code and state', () => {
      expect(githubCallbackSchema.parse({ code: 'c', state: 's' })).toEqual({ code: 'c', state: 's' });
      expect(() => githubCallbackSchema.parse({ code: '' })).toThrow();
      expect(() => githubCallbackSchema.parse({ state: '' })).toThrow();
    });
  });

  describe('Repo Schemas', () => {
    it('connectRepoSchema validates required fields', () => {
      const valid = {
        githubId: 123,
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
        description: 'desc',
      };
      expect(connectRepoSchema.parse(valid)).toEqual(valid);
      expect(() => connectRepoSchema.parse({ ...valid, githubId: '123' })).toThrow(); // string instead of number
      expect(() => connectRepoSchema.parse({ ...valid, owner: '' })).toThrow();
    });

    it('updateRepoConfigSchema validates boolean and string fields', () => {
        const valid = {
            autoGenerate: true,
            customerTone: 'friendly'
        };
        expect(updateRepoConfigSchema.parse(valid)).toEqual(valid);
        expect(updateRepoConfigSchema.parse({})).toEqual({});
        expect(() => updateRepoConfigSchema.parse({ autoGenerate: 'yes' })).toThrow();
    });

    it('updateRepoSettingsSchema validates slug and hex color', () => {
        expect(updateRepoSettingsSchema.parse({ slug: 'valid-slug' })).toEqual({ slug: 'valid-slug' });
        expect(updateRepoSettingsSchema.parse({ publicAccentColor: '#ff0000' })).toEqual({ publicAccentColor: '#ff0000' });

        expect(() => updateRepoSettingsSchema.parse({ slug: 'Invalid Slug' })).toThrow(); // uppercase/space
        expect(() => updateRepoSettingsSchema.parse({ publicAccentColor: 'red' })).toThrow(); // not hex
    });

    it('createChannelSchema validates enums and url', () => {
        const valid = {
            type: 'SLACK',
            name: 'Slack',
            webhookUrl: 'https://example.com',
            audience: 'CUSTOMER'
        };
        expect(createChannelSchema.parse(valid)).toEqual(valid);
        expect(() => createChannelSchema.parse({ ...valid, type: 'INVALID' })).toThrow();
        expect(() => createChannelSchema.parse({ ...valid, webhookUrl: 'not-url' })).toThrow();
    });
  });

  describe('Billing Schemas', () => {
      it('checkoutSchema validates plan enum', () => {
          expect(checkoutSchema.parse({ plan: 'pro' })).toEqual({ plan: 'pro' });
          expect(checkoutSchema.parse({ plan: 'TEAM' })).toEqual({ plan: 'TEAM' }); // refine uses toLowerCase
          expect(() => checkoutSchema.parse({ plan: 'free' })).toThrow();
      });
  });

  describe('Release Schemas', () => {
      it('regenerateNotesSchema accepts optional tone', () => {
          expect(regenerateNotesSchema.parse({ tone: 'funny' })).toEqual({ tone: 'funny' });
          expect(regenerateNotesSchema.parse({})).toEqual({});
      });

      it('publishReleaseSchema accepts optional channels array', () => {
          expect(publishReleaseSchema.parse({ channels: ['C1', 'C2'] })).toEqual({ channels: ['C1', 'C2'] });
          expect(publishReleaseSchema.parse({})).toEqual({});
          expect(() => publishReleaseSchema.parse({ channels: 'string' })).toThrow();
      });
  });

  describe('Admin Schemas', () => {
      it('updateUserAdminSchema validates subscriptionTier', () => {
          expect(updateUserAdminSchema.parse({ subscriptionTier: 'PRO' })).toEqual({ subscriptionTier: 'PRO' });
          expect(() => updateUserAdminSchema.parse({ subscriptionTier: 'SUPER' })).toThrow();
      });
  });
});

describe('Route Validation Integration', () => {
  const app = new Hono();
  app.route('/auth', auth);

  it('GET /auth/github/callback returns 400 for missing query params', async () => {
    const res = await app.request('/auth/github/callback');
    expect(res.status).toBe(400);
    const body = await res.json();
    // Verify it's a validation error
    expect(body).toHaveProperty('success', false);
    // zod-validator returns { success: false, error: ... } by default
  });

  it('GET /auth/github/callback returns 400 for invalid query params', async () => {
    const res = await app.request('/auth/github/callback?code=&state=');
    expect(res.status).toBe(400);
  });

  // Note: We don't test success case here because it would trigger external calls.
  // We rely on schema tests for positive validation.
});
