import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  retryRepoImport: jest.fn(),
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
    canManage: true,
    slug: 'test-repo-slug',
    isPublic: true,
    entitlements: { automation: false, channels: false, branding: false, grandfathered: false },
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
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/dashboard/repos/repo-123');
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

  it('directs a private repository to public settings instead of a missing changelog', async () => {
    (api.getRepo as jest.Mock).mockResolvedValue({ ...mockRepo, isPublic: false });
    render(<RepoDetailPage />);
    expect(await screen.findByRole('link', { name: 'Enable public changelog' })).toHaveAttribute('href', '/dashboard/repos/repo-123/settings');
    expect(screen.queryByRole('link', { name: 'View Changelog' })).not.toBeInTheDocument();
  });

  it('shows organization members a read-only repository view', async () => {
    (api.getRepo as jest.Mock).mockResolvedValue({
      ...mockRepo,
      canManage: false,
      isPublic: false,
      entitlements: { ...mockRepo.entitlements, channels: true },
      config: { channels: [{ id: 'channel-1', name: 'Announcements', type: 'SLACK', audience: 'CUSTOMER', enabled: true }] },
    });
    render(<RepoDetailPage />);
    expect(await screen.findByText('Announcements')).toBeInTheDocument();
    expect(screen.getByText(/Ask a team admin to change them/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Enable public changelog' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit tone and automation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry GitHub import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Channel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove channel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '● Active' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Audience for Announcements')).not.toBeInTheDocument();
  });

  it('blocks Free channel creation and updates but permits pausing and removing an existing channel', async () => {
    const channel = { id: 'channel-1', name: 'Announcements', type: 'SLACK', audience: 'CUSTOMER', enabled: true };
    (api.getRepo as jest.Mock).mockResolvedValue({ ...mockRepo, config: { channels: [channel] } });
    (api.updateChannel as jest.Mock).mockResolvedValue({ ...channel, enabled: false });
    render(<RepoDetailPage />);
    expect(await screen.findByRole('button', { name: 'Add Channel' })).toBeDisabled();
    expect(screen.getByLabelText('Channel Name')).toBeDisabled();
    expect(screen.getByLabelText('Audience for Announcements')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove channel' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '● Active' }));
    await waitFor(() => expect(api.updateChannel).toHaveBeenCalledWith('repo-123', 'channel-1', { enabled: false }));
    expect(await screen.findByRole('button', { name: '○ Paused' })).toBeDisabled();
  });

  it.each([false, true])('allows entitled channel creation (preserved legacy access: %s)', async (grandfathered) => {
    (api.getRepo as jest.Mock).mockResolvedValue({ ...mockRepo, entitlements: { ...mockRepo.entitlements, channels: true, grandfathered } });
    (api.addChannel as jest.Mock).mockResolvedValue({ id: 'channel-1', name: 'Announcements', type: 'SLACK', audience: 'CUSTOMER', enabled: true });
    render(<RepoDetailPage />);
    expect(await screen.findByRole('button', { name: 'Add Channel' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'Announcements' } });
    fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://hooks.slack.com/services/test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Channel' }));
    await waitFor(() => expect(api.addChannel).toHaveBeenCalledWith('repo-123', expect.objectContaining({ name: 'Announcements', enabled: true })));
  });

  it('refreshes imported releases after connecting instead of leaving a false empty state', async () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/dashboard/repos/repo-123?importing=1');
    (api.getRepo as jest.Mock).mockResolvedValueOnce(mockRepo).mockResolvedValue({
      ...mockRepo, releases: [{ id: 'release-1', tagName: 'v1.0.0', name: 'First release', status: 'SKIPPED', publishedAt: null }],
    });
    const view = render(<RepoDetailPage />);
    await act(async () => {});
    expect(screen.getByText('Importing recent GitHub releases…')).toBeInTheDocument();
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.queryByText('Importing recent GitHub releases…')).not.toBeInTheDocument();
    expect(api.getUser).toHaveBeenCalledTimes(1);
    view.unmount();
    jest.useRealTimers();
  });

  it('stops automatic polling after a minute and allows a manual retry', async () => {
    jest.useFakeTimers();
    window.history.replaceState({}, '', '/dashboard/repos/repo-123?importing=1');
    const view = render(<RepoDetailPage />);
    await act(async () => {});
    for (let index = 0; index < 20; index++) {
      await act(async () => { jest.advanceTimersByTime(3000); });
    }
    expect(screen.getByText(/Automatic refresh has stopped/)).toBeInTheDocument();
    expect(api.getRepo).toHaveBeenCalledTimes(21);
    await act(async () => { jest.advanceTimersByTime(60000); });
    expect(api.getRepo).toHaveBeenCalledTimes(21);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); });
    expect(api.getRepo).toHaveBeenCalledTimes(22);
    view.unmount();
    jest.useRealTimers();
  });

  it('shows a failed GitHub import and recovers on retry', async () => {
    (api.retryRepoImport as jest.Mock)
      .mockRejectedValueOnce(new Error('Could not import GitHub releases.'))
      .mockResolvedValueOnce({ status: 'complete', found: 1 });
    (api.getRepo as jest.Mock)
      .mockResolvedValueOnce(mockRepo)
      .mockResolvedValueOnce(mockRepo)
      .mockResolvedValue({ ...mockRepo, releases: [{ id: 'release-1', tagName: 'v1.0.0', name: 'First release', status: 'SKIPPED', publishedAt: null }] });

    render(<RepoDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry GitHub import' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import GitHub releases.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry GitHub import' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Checked 1 recent published GitHub release');
    expect(await screen.findByText('v1.0.0')).toBeInTheDocument();
    expect(api.retryRepoImport).toHaveBeenCalledTimes(2);
  });
});
