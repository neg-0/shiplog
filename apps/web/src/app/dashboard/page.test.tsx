import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import * as api from '../../lib/api';

// Mock dependencies
jest.mock('../../lib/api', () => ({
  getRepos: jest.fn(),
  getUser: jest.fn(),
  isAuthenticated: jest.fn(() => true),
  exchangeAuthCode: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="icon-alert-circle" />,
  GitBranch: () => <div data-testid="icon-git-branch" />,
  Loader2: () => <div data-testid="icon-loader" />,
  Plus: () => <div data-testid="icon-plus" />,
  RefreshCw: () => <div data-testid="icon-refresh" />,
  Ship: () => <div data-testid="icon-ship" />,
}));

describe('DashboardPage', () => {
  const mockUser = {
    id: 'user-1',
    login: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    subscriptionTier: 'FREE',
    subscriptionStatus: 'active',
    trialEndsAt: null,
    repoCount: 2,
  };

  const mockRepos = [
    {
      id: 'repo-1',
      fullName: 'org/repo-one',
      description: 'First repo',
      status: 'ACTIVE',
      lastRelease: 'v1.0.0',
      lastReleaseDate: new Date().toISOString(),
    },
    {
      id: 'repo-2',
      fullName: 'org/repo-two',
      description: 'Second repo',
      status: 'PENDING',
      lastRelease: null,
      lastReleaseDate: null,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (api.isAuthenticated as jest.Mock).mockReturnValue(true);
    (api.getUser as jest.Mock).mockResolvedValue(mockUser);
    (api.getRepos as jest.Mock).mockResolvedValue({ repos: mockRepos });
  });

  it('shows loading state initially', () => {
    // Make API calls hang so loading state stays visible
    (api.getRepos as jest.Mock).mockReturnValue(new Promise(() => {}));
    (api.getUser as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<DashboardPage />);

    expect(screen.getAllByTestId('icon-loader').length).toBeGreaterThan(0);
  });

  it('renders repos when loaded', async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(api.getRepos).toHaveBeenCalled());

    expect(await screen.findByText('org/repo-one')).toBeInTheDocument();
    expect(await screen.findByText('org/repo-two')).toBeInTheDocument();
    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(await screen.findByText('Setup needed')).toBeInTheDocument();
  });

  it('shows empty state when no repos', async () => {
    (api.getRepos as jest.Mock).mockResolvedValue({ repos: [] });

    render(<DashboardPage />);

    expect(await screen.findByText('No repos connected')).toBeInTheDocument();
    expect(screen.getByText('Connect your first GitHub repository to get started')).toBeInTheDocument();

    const connectLink = screen.getByText('Connect Repository').closest('a');
    expect(connectLink).toHaveAttribute('href', '/dashboard/repos/connect');
  });

  it('redirects to login when not authenticated', () => {
    (api.isAuthenticated as jest.Mock).mockReturnValue(false);

    render(<DashboardPage />);

    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });

  it('shows the Connect Repo button', async () => {
    render(<DashboardPage />);

    await waitFor(() => expect(api.getRepos).toHaveBeenCalled());

    const connectLink = (await screen.findByText('Connect Repo')).closest('a');
    expect(connectLink).toHaveAttribute('href', '/dashboard/repos/connect');
  });

  it('shows user subscription tier', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText('FREE Plan')).toBeInTheDocument();
  });
});
