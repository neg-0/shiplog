import { jest, describe, it, expect } from '@jest/globals';

// Mock isomorphic-dompurify before importing the module under test
jest.unstable_mockModule('isomorphic-dompurify', () => ({
  default: {
    sanitize: jest.fn((html: string, _opts: any) => {
      // Simulate DOMPurify stripping dangerous tags but keeping allowed ones
      return html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
        .replace(/<img\b[^>]*\/?>/gi, '')
        .replace(/\s*on\w+="[^"]*"/gi, '');
    }),
  },
}));

const { sanitizeHtml } = await import('./sanitize.js');

describe('sanitizeHtml', () => {
  it('should return safe HTML unchanged', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    const result = sanitizeHtml(input);
    expect(result).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('should strip script tags', () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).toContain('<p>Safe</p>');
  });

  it('should strip iframe tags', () => {
    const input = '<p>Text</p><iframe src="evil.com"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe');
  });

  it('should strip img tags', () => {
    const input = '<p>Text</p><img src="x" onerror="alert(1)" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<img');
  });

  it('should add rel="noopener noreferrer" to anchor tags missing rel', () => {
    const input = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('should not double-add rel if already present', () => {
    const input = '<a rel="noopener" href="https://example.com">Link</a>';
    const result = sanitizeHtml(input);
    // The regex only adds rel when rel= is not present; since rel= is present, no change
    expect(result).toBe('<a rel="noopener" href="https://example.com">Link</a>');
  });

  it('should handle empty string', () => {
    const result = sanitizeHtml('');
    expect(result).toBe('');
  });

  it('should strip inline event handlers', () => {
    const input = '<p onclick="alert(1)">Click</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
  });
});
