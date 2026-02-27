import { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const validate = (schema: z.ZodSchema) => zValidator('json', schema, (result, c: Context) => {
  if (!result.success) {
    return c.json({ error: 'Invalid input', details: result.error.errors }, 400);
  }
  return undefined;
});
