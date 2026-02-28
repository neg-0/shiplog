import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'ol', 'li', 'br', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'],
    ALLOWED_ATTR: ['href'],
    FORCE_BODY: true,
  });

  // Ensure all <a> tags have rel="noopener noreferrer"
  return clean.replace(/<a\b(?![^>]*\brel=)/gi, '<a rel="noopener noreferrer"');
}
