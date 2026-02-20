import { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const validate = (schema: z.ZodSchema) => zValidator('json', schema, (result, c: Context) => {
  if (!result.success) {
    return c.json({ error: 'Invalid input', details: result.error.errors }, 400);
  }
});

export const commonSchemas = {
  pagination: z.object({
    page: z.string().optional().transform(v => parseInt(v || '1')),
    limit: z.string().optional().transform(v => parseInt(v || '20')),
  }),
  id: z.string().cuid(),
  email: z.string().email(),
};
