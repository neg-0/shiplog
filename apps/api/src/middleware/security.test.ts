import { jest, describe, it, expect } from '@jest/globals';
import { Hono } from 'hono';
import { securityHeaders } from './security.js';

describe('securityHeaders middleware', () => {
  function createApp() {
    const app = new Hono();
    app.use('*', securityHeaders());
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('should set X-Content-Type-Options header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('should set X-Frame-Options header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('should set X-XSS-Protection header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });

  it('should set Strict-Transport-Security header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload'
    );
  });

  it('should set Content-Security-Policy header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
  });

  it('should set Referrer-Policy header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('should set Cache-Control header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('should set Permissions-Policy header', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()'
    );
  });

  it('should not interfere with the response body', async () => {
    const app = createApp();
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });

  it('should set all headers on every request', async () => {
    const app = createApp();
    const expectedHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
      'Content-Security-Policy',
      'Referrer-Policy',
      'Cache-Control',
      'Permissions-Policy',
    ];

    const res = await app.request('/test');
    for (const header of expectedHeaders) {
      expect(res.headers.get(header)).not.toBeNull();
    }
  });
});
