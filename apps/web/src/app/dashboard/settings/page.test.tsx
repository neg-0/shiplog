import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SettingsPage from './page';
import * as api from '../../../lib/api';

// Mock dependencies
jest.mock('../../../lib/api', () => ({
  getUser: jest.fn(),
  isAuthenticated: jest.fn(() => true),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  logout: jest.fn(),
  createCheckoutSession: jest.fn(),
  createPortalSession: jest.fn(),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/Dialog', () => ({
  AlertDialog: ({ isOpen, title, message, onClose }: { isOpen: boolean; title: string; message: string; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="alert-dialog">
        <span>{title}</span>
        <span>{message}</span>
        <button onClick={onClose}>OK</button>
      </div>
    ) : null,
}));

jest.mock('lucide-react', () => ({
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
  CreditCard: () => <div data-testid="icon-credit-card" />,
  Key: () => <div data-testid="icon-key" />,
  User: () => <div data-testid="icon-user" />,
}));

describe('SettingsPage', () => {
  const mockUser = {
    id: 'user-1',
    login: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    subscriptionTier: 'FREE',
    subscriptionStatus: 'active',
    trialEndsAt: null,
    repoCount: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (api.isAuthenticated as jest.Mock).mockReturnValue(true);
    (api.getUser as jest.Mock).mockResolvedValue(mockUser);
  });

  it('renders user profile section', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    expect(await screen.findByText('Edit Profile')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test User')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
  });

  it('shows subscription info', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    expect(await screen.findByText('Plan')).toBeInTheDocument();
    expect(screen.getByText(/Current plan: FREE/)).toBeInTheDocument();
    expect(screen.getByText(/Status: active/)).toBeInTheDocument();
  });

  it('shows upgrade button for non-TEAM users', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    expect(await screen.findByText('Upgrade')).toBeInTheDocument();
    expect(screen.getByText('Manage Subscription')).toBeInTheDocument();
  });

  it('hides upgrade button for TEAM users', async () => {
    (api.getUser as jest.Mock).mockResolvedValue({ ...mockUser, subscriptionTier: 'TEAM' });

    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    expect(await screen.findByText('Manage Subscription')).toBeInTheDocument();
    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });

  it('save changes calls updateUser', async () => {
    (api.updateUser as jest.Mock).mockResolvedValue({ success: true });
    (api.getUser as jest.Mock)
      .mockResolvedValueOnce(mockUser)
      .mockResolvedValueOnce({ ...mockUser, name: 'Updated Name' });

    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    const saveButton = await screen.findByText('Save Changes');

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(api.updateUser).toHaveBeenCalledWith({ name: 'Test User' });
  });

  it('shows delete account confirmation modal', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    // "Delete Account" appears as both a <p> label and a <button> - click the button
    const deleteButtons = await screen.findAllByText('Delete Account');
    const deleteButton = deleteButtons.find((el) => el.closest('button'))!;
    fireEvent.click(deleteButton);

    expect(screen.getByText('Delete Account?')).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument();
  });

  it('delete account button is disabled until DELETE is typed', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    // Open modal - click the button (not the <p> label)
    const deleteButtons = await screen.findAllByText('Delete Account');
    const openButton = deleteButtons.find((el) => el.closest('button'))!;
    fireEvent.click(openButton);

    // Inside the modal, the confirm button is the last "Delete Account" button
    const allDeleteButtons = screen.getAllByRole('button', { name: 'Delete Account' });
    const confirmButton = allDeleteButtons[allDeleteButtons.length - 1];
    expect(confirmButton).toBeDisabled();

    // Type DELETE
    const input = screen.getByPlaceholderText('DELETE');
    fireEvent.change(input, { target: { value: 'DELETE' } });

    expect(confirmButton).not.toBeDisabled();
  });

  it('redirects to login when not authenticated', () => {
    (api.isAuthenticated as jest.Mock).mockReturnValue(false);

    render(<SettingsPage />);

    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });

  it('shows API Keys section', async () => {
    render(<SettingsPage />);

    await waitFor(() => expect(api.getUser).toHaveBeenCalled());

    expect(await screen.findByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
  });
});
