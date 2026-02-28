export { buildCustomerMessages } from './customer.js';
export { buildDeveloperMessages } from './developer.js';
export { buildStakeholderMessages } from './stakeholder.js';

const INJECTION_PATTERNS = /^(IGNORE|SYSTEM:|###|ASSISTANT:|```)/;

/**
 * Sanitize user-controlled text before embedding in prompts.
 * Truncates to maxLength and strips lines matching common injection patterns.
 */
export function sanitizePromptInput(text: string, maxLength: number): string {
  const truncated = text.slice(0, maxLength);
  return truncated
    .split('\n')
    .filter((line) => !INJECTION_PATTERNS.test(line.trimStart()))
    .join('\n');
}
