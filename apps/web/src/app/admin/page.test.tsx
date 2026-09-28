import { render, screen, waitFor } from '@testing-library/react';
import AdminDashboard from './page';

const router = { replace: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/admin' }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
jest.mock('../../lib/api', () => ({ isAuthenticated: () => true }));

const metrics = {
  periodDays: 30,
  users: { total: 5, free: 3, pro: 1, team: 1, new: 1 },
  organizations: 0,
  repos: { total: 2, active: 1, error: 0 },
  releases: { total: 4, new: 2, needingAttention: 0, stuckProcessing: 0 },
  deliveries: { sentExternal: 3, failedExternalAttempts: 0 },
  ai: { savedDrafts: 2, recordedTokens: 600, missingTokenCounts: 0 },
  billing: { activePaidPlanRecords: 0, trialingPlanRecords: 1, pastDuePlanRecords: 0, paidTierWithoutSubscription: 0, collectedRevenue: null, mrr: null, reason: 'Stripe invoice and payment amounts are not stored in ShipLog.' },
};

describe('AdminDashboard', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation((path: string) => Promise.resolve({ ok: true, json: async () => path.includes('/metrics') ? metrics : { events: [] } }));
  });

  it('uses the web API proxy and does not invent revenue from plan counts', async () => {
    render(<AdminDashboard />);
    expect(await screen.findByText(/Revenue and MRR unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/600 tokens on 2 current saved drafts/)).toBeInTheDocument();
    expect(screen.getByText(/No recorded signups, releases or external sends yet/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/metrics', { credentials: 'include' });
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/activity?limit=12', { credentials: 'include' });
  });

  it('surfaces an API failure', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Database unavailable' }) }));
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable'));
  });
});
