import { render, screen } from '@testing-library/react';
import AdminOrganizationsPage from './page';

const router = { replace: jest.fn() };
jest.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/admin/organizations' }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
jest.mock('../../../lib/api', () => ({ isAuthenticated: () => true }));

describe('AdminOrganizationsPage', () => {
  it('shows a useful empty state when no organizations exist', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ organizations: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    render(<AdminOrganizationsPage />);
    expect(await screen.findByText('No teams yet')).toBeInTheDocument();
    expect(screen.getByText('Organizations created by Team plan users will appear here.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/organizations?page=1&limit=20', { credentials: 'include' });
  });
});
