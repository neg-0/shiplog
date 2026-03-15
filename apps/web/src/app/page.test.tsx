import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from './page';

// Mock dependencies
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock('../lib/api', () => ({
  isAuthenticated: jest.fn(() => false),
  createCheckoutSession: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Ship: () => <div data-testid="icon-ship" />,
  GitBranch: () => <div data-testid="icon-git-branch" />,
  Users: () => <div data-testid="icon-users" />,
  Mail: () => <div data-testid="icon-mail" />,
  Slack: () => <div data-testid="icon-slack" />,
  Zap: () => <div data-testid="icon-zap" />,
  ArrowRight: () => <div data-testid="icon-arrow-right" />,
  Check: () => <div data-testid="icon-check" />,
  LayoutDashboard: () => <div data-testid="icon-dashboard" />,
}));

describe('Home Page', () => {
  it('renders the hero section', () => {
    render(<Home />);

    expect(screen.getByText(/Release notes that/)).toBeInTheDocument();
    expect(screen.getByText('ship themselves')).toBeInTheDocument();
    expect(screen.getByText(/One commit\. Three audiences\. Zero friction\./)).toBeInTheDocument();
  });

  it('renders the navigation bar with ShipLog branding', () => {
    render(<Home />);

    expect(screen.getAllByText('ShipLog').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
  });

  it('shows Connect GitHub link when not authenticated', () => {
    render(<Home />);

    // Nav bar has "Connect GitHub" as a link; "How it works" section also has the text
    const connectLinks = screen.getAllByText('Connect GitHub');
    const navLink = connectLinks.find((el) => el.closest('a'));
    expect(navLink?.closest('a')).toHaveAttribute('href', '/login');
  });

  it('renders the features section', () => {
    render(<Home />);

    expect(screen.getByText('Three audiences, three formats')).toBeInTheDocument();
    expect(screen.getByText('Customer Changelog')).toBeInTheDocument();
    expect(screen.getByText('Developer Changelog')).toBeInTheDocument();
    expect(screen.getByText('Stakeholder Brief')).toBeInTheDocument();
  });

  it('renders the How it works section', () => {
    render(<Home />);

    expect(screen.getByText('How it works')).toBeInTheDocument();
    // "Connect GitHub" appears both in the nav and in "How it works" step
    expect(screen.getAllByText('Connect GitHub').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Publish a release')).toBeInTheDocument();
    expect(screen.getByText('Notes ship everywhere')).toBeInTheDocument();
  });

  it('renders the pricing section', () => {
    render(<Home />);

    expect(screen.getByText('Simple pricing')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('$29')).toBeInTheDocument();
    expect(screen.getByText('$79')).toBeInTheDocument();
  });

  it('renders the distribution channels section', () => {
    render(<Home />);

    expect(screen.getByText('Delivered to every port')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Discord')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Hosted Page')).toBeInTheDocument();
  });

  it('renders footer with links', () => {
    render(<Home />);

    expect(screen.getByText('© 2026 ShipLog. All rights reserved.')).toBeInTheDocument();

    const footerLinks = ['Docs', 'Changelog', 'Privacy', 'Terms'];
    footerLinks.forEach((linkText) => {
      expect(screen.getAllByText(linkText).length).toBeGreaterThanOrEqual(1);
    });
  });
});
