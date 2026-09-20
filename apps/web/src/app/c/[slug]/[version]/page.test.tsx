import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ReleaseDetailPage from './page';

jest.mock('next/navigation', () => ({ useParams: () => ({ slug: 'acme', version: 'release/v1.0' }) }));
jest.mock('react-markdown', () => ({ __esModule: true, default: ({ children }: { children: string }) => <div>{children}</div> }));

const release = {
  id: 'release-1', repoName: 'Acme', version: 'release/v1.0', name: 'A better release',
  date: '2026-09-19T12:00:00Z', body: null,
  notes: { customer: 'Customer improvements', developer: 'Developer details', stakeholder: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => release });
});

it('renders the API audience object and switches between available audiences', async () => {
  render(<ReleaseDetailPage />);
  expect(await screen.findByText('Customer improvements')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith('/api/public/acme/releases/release%2Fv1.0', expect.any(Object));
  fireEvent.click(screen.getByRole('tab', { name: 'developer' }));
  expect(screen.getByText('Developer details')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: 'stakeholder' })).not.toBeInTheDocument();
});

it('renders a nullable notes response without crashing', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ...release, notes: null }) });
  render(<ReleaseDetailPage />);
  expect(await screen.findByText('No release notes available.')).toBeInTheDocument();
});

it('distinguishes a server failure from a missing release', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });
  render(<ReleaseDetailPage />);
  expect(await screen.findByText('Unable to load this release')).toBeInTheDocument();
  expect(screen.queryByText('Release Not Found')).not.toBeInTheDocument();
});

it('honors the API branding entitlement on the release page', async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ...release, showPoweredBy: false }) });
  render(<ReleaseDetailPage />);
  await screen.findByText('Customer improvements');
  expect(screen.queryByText('Powered by ShipLog')).not.toBeInTheDocument();
});
