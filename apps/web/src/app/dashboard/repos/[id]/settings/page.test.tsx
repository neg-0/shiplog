import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RepoSettingsPage from './page';
import * as api from '../../../../../lib/api';

jest.mock('../../../../../lib/api', () => ({
  getRepo: jest.fn(), getUser: jest.fn(), isAuthenticated: jest.fn(() => true),
  updateRepoConfig: jest.fn(), updateRepoSettings: jest.fn(),
}));
const mockRouter = { push: jest.fn() };
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'repo-1' }), useRouter: () => mockRouter }));
jest.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const repo = {
  id: 'repo-1', fullName: 'acme/repo', isPublic: false,
  entitlements: { automation: false, channels: false, branding: false, grandfathered: false },
  config: { autoGenerate: false, autoPublish: false, customerTone: 'friendly' },
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.getRepo as jest.Mock).mockResolvedValue(repo);
  (api.getUser as jest.Mock).mockResolvedValue({ id: 'user-1', subscriptionTier: 'FREE' });
});

it('keeps new Free automation disabled and exposes generation provider disclosure', async () => {
  render(<RepoSettingsPage />);
  expect(await screen.findByLabelText('Auto-generate changelogs')).toBeDisabled();
  expect(screen.getByLabelText('Auto-generate changelogs')).not.toBeChecked();
  expect(screen.getByLabelText('Auto-publish releases')).toBeDisabled();
  expect(screen.getByText(/Release text, commits, and pull request descriptions are sent to OpenAI/)).toBeInTheDocument();
  expect(screen.getByLabelText('Public changelog')).toBeEnabled();
});

it('allows paid automation opt-in and saves the changed setting', async () => {
  (api.getRepo as jest.Mock).mockResolvedValue({ ...repo, entitlements: { ...repo.entitlements, automation: true } });
  render(<RepoSettingsPage />);
  fireEvent.click(await screen.findByLabelText('Auto-generate changelogs'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(api.updateRepoConfig).toHaveBeenCalledWith('repo-1', { autoGenerate: true, customerTone: 'friendly' }));
});

it('lets a downgraded account change public settings without resending unchanged automation and disable old flags', async () => {
  (api.getRepo as jest.Mock).mockResolvedValue({ ...repo, config: { ...repo.config, autoGenerate: true, autoPublish: true } });
  render(<RepoSettingsPage />);
  fireEvent.click(await screen.findByLabelText('Public changelog'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(api.updateRepoConfig).toHaveBeenCalledWith('repo-1', { customerTone: 'friendly' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled());
  fireEvent.click(screen.getByLabelText('Auto-generate changelogs'));
  fireEvent.click(screen.getByLabelText('Auto-publish releases'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(api.updateRepoConfig).toHaveBeenLastCalledWith('repo-1', { autoGenerate: false, autoPublish: false, customerTone: 'friendly' }));
  expect(screen.getByLabelText('Auto-generate changelogs')).toBeDisabled();
});
