import { z } from 'zod';

// Common Enums
export const AudienceEnum = z.enum(['CUSTOMER', 'DEVELOPER', 'STAKEHOLDER']);
export const ChannelTypeEnum = z.enum(['SLACK', 'DISCORD', 'WEBHOOK']);
export const SubscriptionTierEnum = z.enum(['FREE', 'PRO', 'TEAM']);

// User Schemas
export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

// Auth Schemas
export const githubCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

// Repo Schemas
export const connectRepoSchema = z.object({
  githubId: z.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  fullName: z.string().min(1),
  description: z.string().optional(),
});

export const updateRepoConfigSchema = z.object({
  autoGenerate: z.boolean().optional(),
  autoPublish: z.boolean().optional(),
  generateCustomer: z.boolean().optional(),
  generateDeveloper: z.boolean().optional(),
  generateStakeholder: z.boolean().optional(),
  customerTone: z.string().optional(),
  companyName: z.string().optional(),
  productName: z.string().optional(),
});

export const updateRepoSettingsSchema = z.object({
  isPublic: z.boolean().optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  publicTitle: z.string().optional(),
  publicDescription: z.string().optional(),
  publicLogoUrl: z.string().url().optional().or(z.literal('')),
  publicAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
  hidePoweredBy: z.boolean().optional(),
  excludeFromFeatured: z.boolean().optional(),
});

export const createChannelSchema = z.object({
  type: ChannelTypeEnum,
  name: z.string().min(1),
  webhookUrl: z.string().url(),
  audience: AudienceEnum,
  enabled: z.boolean().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional(),
  audience: AudienceEnum.optional(),
  enabled: z.boolean().optional(),
});

// Billing Schemas
export const checkoutSchema = z.object({
  plan: z.string().refine((val) => ['pro', 'team'].includes(val.toLowerCase()), {
    message: "Plan must be 'pro' or 'team'",
  }),
});

// Release Schemas
export const regenerateNotesSchema = z.object({
  tone: z.string().optional(),
});

export const publishReleaseSchema = z.object({
  channels: z.array(z.string()).optional(),
});

export const updateNotesSchema = z.object({
  customer: z.string().optional(),
  developer: z.string().optional(),
  stakeholder: z.string().optional(),
});

// Admin Schemas
export const updateUserAdminSchema = z.object({
  subscriptionTier: SubscriptionTierEnum.optional(),
});
