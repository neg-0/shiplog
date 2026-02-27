// Test email distribution using SendGrid
// import 'dotenv/config';
import { distributeReleaseWithResults } from '../src/services/distributor.js';

async function testEmail() {
  const target = {
    type: 'email',
    audience: 'stakeholder',
    email: 'captain@shiplog.io',
    name: 'Captain'
  } as const;

  const payload = {
    repo: { fullName: 'neg-0/shiplog' },
    tagName: 'v0.0.1-email-test',
    htmlUrl: 'https://github.com/neg-0/shiplog/releases/tag/v0.0.1-email-test',
    status: 'PUBLISHED',
    id: 'test-release-id',
    publishedAt: new Date(),
    processedAt: new Date(),
    repoId: 'test-repo-id',
    body: 'Test release body',
    isDraft: false,
    isPrerelease: false,
    githubId: 12345,
    name: 'v0.0.1-email-test',
  };

  const notes = {
    customer: '## Customer update\n\nThis is a test email update.',
    developer: '## Developer update\n\n- Fix bugs\n- Add email feature',
    stakeholder: '## Stakeholder update\n\nWe successfully integrated SendGrid.',
    tokensUsed: 100,
    model: 'gpt-4o'
  };

  console.log('Sending test email to captain@shiplog.io...');
  
  const results = await distributeReleaseWithResults(
    // @ts-ignore - partial Release object for testing
    payload,
    notes,
    [target]
  );

  console.log('Result:', JSON.stringify(results, null, 2));
}

testEmail().catch(console.error);
