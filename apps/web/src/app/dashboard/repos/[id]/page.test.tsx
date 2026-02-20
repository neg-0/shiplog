import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RepoDetailPage from './page';
import * as api from '../../../../lib/api';

// Mock dependencies
jest.mock('../../../../lib/api', () => ({
  getRepo: jest.fn(),
  getUser: jest.fn(),
  isAuthenticated: jest.fn(() => true),
  addChannel: jest.fn(),
  updateChannel: jest.fn(),
  deleteChannel: jest.fn(),
  disconnectRepo: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'repo-123' }),
  useRouter: () => mockRouter,
}));

jest.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/Dialog', () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog" />,
}));

describe('RepoDetailPage', () => {
  const mockRepo = {
    id: 'repo-123',
    fullName: 'test-org/test-repo',
    description: 'A test repo',
    status: 'ACTIVE',
    slug: 'test-repo-slug',
    config: {
      channels: [],
    },
    releases: [],
  };

  const mockUser = {
    id: 'user-123',
    subscriptionTier: 'FREE',
  };

  beforeEach(() => {
    (api.getRepo as jest.Mock).mockResolvedValue(mockRepo);
    (api.getUser as jest.Mock).mockResolvedValue(mockUser);
  });

  it('renders the changelog link correctly', async () => {
    render(<RepoDetailPage />);

    // Verify mocks are called
    await waitFor(() => expect(api.getRepo).toHaveBeenCalled());
    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    // Check for repo name
    expect(await screen.findByText(/test-org\/test-repo/i)).toBeInTheDocument();

    // Check for "View Changelog" link
    const changelogLink = (await screen.findByText(/View Changelog/i)).closest('a');

    expect(changelogLink).toBeInTheDocument();
    expect(changelogLink).toHaveAttribute('href', '/c/test-repo-slug');
    expect(changelogLink).toHaveAttribute('target', '_blank');
  });

  it('renders the changelog link with fallback slug correctly', async () => {
    const mockRepoFallback = { ...mockRepo, slug: null };
    (api.getRepo as jest.Mock).mockResolvedValue(mockRepoFallback);

    render(<RepoDetailPage />);

    await waitFor(() => expect(api.getRepo).toHaveBeenCalled());
    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    expect(await screen.findByText(/test-org\/test-repo/i)).toBeInTheDocument();

    const changelogLink = (await screen.findByText(/View Changelog/i)).closest('a');

    expect(changelogLink).toHaveAttribute('href', '/c/test-org-test-repo');
  });
});
