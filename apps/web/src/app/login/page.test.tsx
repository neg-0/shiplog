import React from 'react';
import { render, screen } from '@testing-library/react';
import LoginPage from './page';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock('lucide-react', () => ({
  Ship: () => <div data-testid="icon-ship" />,
  GitBranch: () => <div data-testid="icon-git-branch" />,
  Key: () => <div data-testid="icon-key" />,
}));

jest.mock('../../lib/api', () => ({
  exchangeAuthCode: jest.fn(),
}));

describe('LoginPage', () => {
  it('renders the login page with ShipLog branding', () => {
    render(<LoginPage />);

    expect(screen.getByText('ShipLog')).toBeInTheDocument();
    expect(screen.getByText('Welcome aboard')).toBeInTheDocument();
    expect(screen.getByText('Connect your GitHub to get started')).toBeInTheDocument();
  });

  it('renders Continue with GitHub button with correct href', () => {
    render(<LoginPage />);

    const githubLink = screen.getByText('Continue with GitHub').closest('a');
    expect(githubLink).toBeInTheDocument();
    expect(githubLink).toHaveAttribute('href', '/api/auth/github');
  });

  it('shows Terms of Service and Privacy Policy links', () => {
    render(<LoginPage />);

    const termsLink = screen.getByText('Terms of Service').closest('a');
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute('href', '/terms');

    const privacyLink = screen.getByText('Privacy Policy').closest('a');
    expect(privacyLink).toBeInTheDocument();
    expect(privacyLink).toHaveAttribute('href', '/privacy');
  });

  it('shows what GitHub access will be requested', () => {
    render(<LoginPage />);

    expect(screen.getByText("What we'll access:")).toBeInTheDocument();
    expect(screen.getByText('Read access to your repositories')).toBeInTheDocument();
    expect(screen.getByText('Webhook creation for release events')).toBeInTheDocument();
    expect(screen.getByText('Your GitHub profile (name, email)')).toBeInTheDocument();
  });
});
