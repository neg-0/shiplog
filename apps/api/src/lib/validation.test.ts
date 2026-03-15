import { jest, describe, it, expect } from '@jest/globals';
import { Hono } from 'hono';
import { z } from 'zod';
import { validate } from './validation.js';

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  });

  function createApp() {
    const app = new Hono();
    app.post('/test', validate(schema), (c) => {
      return c.json({ ok: true });
    });
    return app;
  }

  it('should pass through when input is valid', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('should return 400 when required field is missing', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBe('Invalid input');
    expect(data.details).toBeDefined();
  });

  it('should return 400 when field has wrong type', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 'not-a-number' }),
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBe('Invalid input');
  });

  it('should return 400 when body is empty object', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('should return 400 when age is negative', async () => {
    const app = createApp();
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: -5 }),
    });

    expect(res.status).toBe(400);
  });
});
