import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReleaseDetailPage from './page';
import * as api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  getRelease: jest.fn(), getUser: jest.fn(), isAuthenticated: jest.fn(() => true),
  publishRelease: jest.fn(), regenerateNotes: jest.fn(), updateReleaseNotes: jest.fn(),
}));
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'release-1' }), useRouter: () => mockRouter }));
jest.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: { children: string }) => <div>{children}</div> }));
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => function Editor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return <textarea aria-label="Release notes" value={value} onChange={e => onChange(e.target.value)} />;
  },
}));

const release = {
  id: 'release-1', tagName: 'v1.0', name: 'First release', status: 'READY', publishedAt: null,
  htmlUrl: 'https://github.com/acme/repo/releases/v1.0',
  repo: { id: 'repo-1', fullName: 'acme/repo', isPublic: true, entitlements: { channels: true }, config: { channels: [] } },
  notes: { customer: 'Original customer notes', developer: 'Technical details', stakeholder: 'Summary' },
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.getRelease as jest.Mock).mockResolvedValue(release);
  (api.getUser as jest.Mock).mockResolvedValue({ id: 'user-1' });
  (api.publishRelease as jest.Mock).mockResolvedValue({ status: 'published' });
});

it('can publish a hosted changelog without any notification channels', async () => {
  render(<ReleaseDetailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
  fireEvent.click(screen.getByRole('button', { name: 'Publish to changelog' }));
  await waitFor(() => expect(api.publishRelease).toHaveBeenCalledWith('release-1', []));
  expect(await screen.findByText('Release notes published successfully.')).toBeInTheDocument();
});

it('keeps unsaved edits in their audience and prevents publishing saved content by mistake', async () => {
  render(<ReleaseDetailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Release notes' }), { target: { value: 'Unsaved copy' } });
  expect(screen.getByRole('button', { name: /Developer Technical/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(api.updateReleaseNotes).toHaveBeenCalledWith('release-1', { customer: 'Unsaved copy' }));
});

it('requires confirmation before replacing manually edited notes across all audiences', async () => {
  render(<ReleaseDetailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Regenerate' }));
  expect(api.regenerateNotes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate all notes' }));
  await waitFor(() => expect(api.regenerateNotes).toHaveBeenCalledWith('release-1'));
});

it('shows partial delivery failures and omits disabled channels from publishing', async () => {
  (api.getRelease as jest.Mock).mockResolvedValue({ ...release, repo: { ...release.repo, config: { channels: [
    { id: 'enabled', name: 'Announcements', enabled: true, audience: 'CUSTOMER', type: 'SLACK' },
    { id: 'disabled', name: 'Paused channel', enabled: false, audience: 'DEVELOPER', type: 'SLACK' },
  ] } } });
  (api.publishRelease as jest.Mock).mockResolvedValue({ status: 'partial_success', failedCount: 1 });
  render(<ReleaseDetailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
  expect(screen.queryByLabelText('Notify Paused channel')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Publish and notify 1 channel' }));
  await waitFor(() => expect(api.publishRelease).toHaveBeenCalledWith('release-1', ['enabled']));
  expect(await screen.findByText(/1 delivery failed/)).toBeInTheDocument();
});

it('keeps a private Free changelog private and excludes previously configured paid channels', async () => {
  (api.getRelease as jest.Mock).mockResolvedValue({ ...release, repo: { ...release.repo, isPublic: false, entitlements: { channels: false }, config: { channels: [
    { id: 'enabled', name: 'Announcements', enabled: true, audience: 'CUSTOMER', type: 'SLACK' },
  ] } } });
  render(<ReleaseDetailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
  expect(screen.getByText(/Publishing does not make it public/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Enable public access in repository settings' })).toHaveAttribute('href', '/dashboard/repos/repo-1/settings');
  expect(screen.queryByRole('checkbox', { name: 'Notify Announcements' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Publish notes privately' }));
  await waitFor(() => expect(api.publishRelease).toHaveBeenCalledWith('release-1', []));
  expect(await screen.findByText(/Your hosted changelog remains private/)).toBeInTheDocument();
});

it('fails closed for channel delivery when entitlement data is missing', async () => {
  (api.getRelease as jest.Mock).mockResolvedValue({ ...release, repo: { ...release.repo, entitlements: undefined, config: { channels: [
    { id: 'enabled', name: 'Announcements', enabled: true, audience: 'CUSTOMER', type: 'SLACK' },
  ] } } });
  render(<ReleaseDetailPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
  expect(screen.queryByRole('checkbox', { name: 'Notify Announcements' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Publish to changelog' }));
  await waitFor(() => expect(api.publishRelease).toHaveBeenCalledWith('release-1', []));
});
