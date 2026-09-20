import { generateMetadata } from './page';

let mockForwardedFor: string | null = null;
jest.mock('next/headers', () => ({ headers: async () => ({ get: () => mockForwardedFor }) }));
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/FeedbackWidget', () => ({ FeedbackWidget: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockForwardedFor = null;
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ name: 'ShipLog', releases: [] }) });
});

it('forwards the ingress visitor address and never caches privacy-controlled changelogs', async () => {
  mockForwardedFor = '203.0.113.10, 10.0.0.1';
  await generateMetadata({ params: Promise.resolve({ slug: 'neg-0-shiplog' }) });
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/public/neg-0-shiplog'), {
    cache: 'no-store', headers: { 'X-Forwarded-For': '203.0.113.10' },
  });
});

it('does not invent a visitor address when the ingress header is missing', async () => {
  await generateMetadata({ params: Promise.resolve({ slug: 'neg-0-shiplog' }) });
  expect(fetch).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
});
