import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Home from './page';
import { isAuthenticated } from '../lib/api';

jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
jest.mock('../lib/api', () => ({ isAuthenticated: jest.fn(() => false) }));

beforeEach(() => { (isAuthenticated as jest.Mock).mockReturnValue(false); });

it('routes free signup to login and explains when the Pro trial starts', () => {
  render(<Home />);
  expect(screen.getByRole('link', { name: /Connect GitHub — start free/ })).toHaveAttribute('href', '/login');
  expect(screen.getByText(/14-day Pro trial from Settings when you upgrade/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Explore Team' })).toHaveAttribute('href', '/login');
});

it('sends returning users to their dashboard and Pro settings', () => {
  (isAuthenticated as jest.Mock).mockReturnValue(true);
  render(<Home />);
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
  expect(screen.getByRole('link', { name: 'Upgrade to Pro' })).toHaveAttribute('href', '/dashboard/settings');
});

it('switches the release example between audiences', () => {
  render(<Home />);
  fireEvent.click(screen.getByRole('button', { name: 'Developers' }));
  expect(screen.getByRole('heading', { name: 'PDF export is here.' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Developers' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Stakeholders' }));
  expect(screen.getByRole('heading', { name: 'Less friction in reporting.' })).toBeInTheDocument();
});

it('lets visitors pause and resume the harbor animation', () => {
  render(<Home />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause harbor animation' }));
  expect(screen.getByRole('button', { name: 'Play harbor animation' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Play harbor animation' }));
  expect(screen.getByRole('button', { name: 'Pause harbor animation' })).toHaveAttribute('aria-pressed', 'false');
});
