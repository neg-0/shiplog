import { render, screen, fireEvent, act } from '@testing-library/react';
import { DashboardLayout } from '../DashboardLayout';
import * as api from '../../lib/api';
import { useRouter, usePathname } from 'next/navigation';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}));

jest.mock('../../lib/api', () => ({
  logout: jest.fn(() => Promise.resolve()),
}));

// Mock lucide-react icons to make them easy to find
jest.mock('lucide-react', () => ({
  Ship: () => <div data-testid="icon-ship" />,
  Settings: () => <div data-testid="icon-settings" />,
  GitBranch: () => <div data-testid="icon-git-branch" />,
  Bell: () => <div data-testid="icon-bell" />,
  LogOut: () => <div data-testid="icon-logout" />,
  Menu: () => <div data-testid="icon-menu" />,
  X: () => <div data-testid="icon-x" />,
  Building2: () => <div data-testid="icon-building" />,
}));

jest.mock('../DashboardFeedbackWidget', () => ({
  DashboardFeedbackWidget: () => <div data-testid="feedback-widget">Feedback Widget</div>,
}));

describe('DashboardLayout', () => {
  const mockUser = {
    id: '1',
    login: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    avatarUrl: 'https://example.com/avatar.png',
    subscriptionTier: 'FREE',
    subscriptionStatus: 'active',
    trialEndsAt: null,
    repoCount: 0,
  } as any;

  const mockRouter = {
    push: jest.fn(),
  };

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (usePathname as jest.Mock).mockReturnValue('/dashboard');
    jest.clearAllMocks();
  });

  it('renders children and sidebar content', () => {
    render(
      <DashboardLayout user={mockUser}>
        <div data-testid="child-content">Child Content</div>
      </DashboardLayout>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    // Use getAllByTestId because Ship icon appears in both header and sidebar
    expect(screen.getAllByTestId('icon-ship')).toHaveLength(2);
    expect(screen.getByText('Repositories')).toBeInTheDocument();
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByTestId('feedback-widget')).toBeInTheDocument();
  });

  it('renders user information', () => {
    render(
      <DashboardLayout user={mockUser}>
        <div>Content</div>
      </DashboardLayout>
    );

    expect(screen.getByText('Test User')).toBeInTheDocument();
    const avatar = screen.getByAltText('Test User');
    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png');
  });

  it('highlights active navigation item', () => {
    (usePathname as jest.Mock).mockReturnValue('/dashboard/settings');

    render(
      <DashboardLayout user={mockUser}>
        <div>Content</div>
      </DashboardLayout>
    );

    const settingsLink = screen.getByText('Settings').closest('a');
    expect(settingsLink).toHaveClass('bg-navy-800');
    expect(settingsLink).toHaveClass('text-white');
  });

  it('handles logout', async () => {
    render(
      <DashboardLayout user={mockUser}>
        <div>Content</div>
      </DashboardLayout>
    );

    // Logout button is in sidebar
    const logoutButton = screen.getByTitle('Logout');
    await act(async () => {
      fireEvent.click(logoutButton);
    });

    expect(api.logout).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });

  it('toggles mobile sidebar', () => {
    const { container } = render(
      <DashboardLayout user={mockUser}>
        <div>Content</div>
      </DashboardLayout>
    );

    // Initial state: menu icon visible, overlay hidden
    expect(screen.getByTestId('icon-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-x')).not.toBeInTheDocument();

    // Find toggle button in header
    const toggleButton = screen.getByTestId('icon-menu').closest('button');
    expect(toggleButton).toBeInTheDocument();

    // Open sidebar
    fireEvent.click(toggleButton!);

    // Now X icon should be visible
    expect(screen.getByTestId('icon-x')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-menu')).not.toBeInTheDocument();

    // Check for overlay presence (it has specific classes)
    // We can query by class name using container
    const overlay = container.querySelector('.bg-black\\/50');
    expect(overlay).toBeInTheDocument();

    // Click overlay to close
    fireEvent.click(overlay!);

    // Should be closed again
    expect(screen.getByTestId('icon-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-x')).not.toBeInTheDocument();
  });
});
