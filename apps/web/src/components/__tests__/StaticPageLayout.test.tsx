import React from 'react';
import { render, screen } from '@testing-library/react';
import StaticPageLayout from '../StaticPageLayout';

// Mock dependencies
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

jest.mock('lucide-react', () => ({
  Ship: () => <div data-testid="icon-ship" />,
}));

describe('StaticPageLayout', () => {
  it('renders header with ShipLog branding', () => {
    render(
      <StaticPageLayout>
        <div>Content</div>
      </StaticPageLayout>
    );

    // ShipLog appears in both header and footer
    expect(screen.getAllByText('ShipLog').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('icon-ship').length).toBeGreaterThanOrEqual(2);
  });

  it('renders children content', () => {
    render(
      <StaticPageLayout>
        <div data-testid="child-content">My Page Content</div>
      </StaticPageLayout>
    );

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByText('My Page Content')).toBeInTheDocument();
  });

  it('renders header navigation links', () => {
    render(
      <StaticPageLayout>
        <div>Content</div>
      </StaticPageLayout>
    );

    const docsLinks = screen.getAllByText('Docs');
    expect(docsLinks.length).toBeGreaterThanOrEqual(1);
    expect(docsLinks[0].closest('a')).toHaveAttribute('href', '/docs');

    const changelogLinks = screen.getAllByText('Changelog');
    expect(changelogLinks.length).toBeGreaterThanOrEqual(1);
    expect(changelogLinks[0].closest('a')).toHaveAttribute('href', '/changelog');

    const pricingLink = screen.getByText('Pricing');
    expect(pricingLink.closest('a')).toHaveAttribute('href', '/#pricing');

    const loginLink = screen.getByText('Login');
    expect(loginLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('renders footer with links', () => {
    render(
      <StaticPageLayout>
        <div>Content</div>
      </StaticPageLayout>
    );

    expect(screen.getByText('© 2026 ShipLog. All rights reserved.')).toBeInTheDocument();

    // Footer has Docs, Changelog, Terms, Privacy links
    const termsLinks = screen.getAllByText('Terms');
    expect(termsLinks.length).toBeGreaterThanOrEqual(1);
    expect(termsLinks[0].closest('a')).toHaveAttribute('href', '/terms');

    const privacyLinks = screen.getAllByText('Privacy');
    expect(privacyLinks.length).toBeGreaterThanOrEqual(1);
    expect(privacyLinks[0].closest('a')).toHaveAttribute('href', '/privacy');
  });

  it('renders home link in header', () => {
    render(
      <StaticPageLayout>
        <div>Content</div>
      </StaticPageLayout>
    );

    // The ShipLog logo/name in header links to home
    const headerLink = screen.getAllByText('ShipLog')[0].closest('a');
    expect(headerLink).toHaveAttribute('href', '/');
  });
});
