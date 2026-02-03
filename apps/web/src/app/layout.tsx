import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShipLog - Release notes that ship themselves',
  description: 'Automatically generate and distribute release notes tailored for customers, developers, and execs — from your GitHub releases.',
  keywords: ['changelog', 'release notes', 'github', 'automation', 'developer tools'],
  authors: [{ name: 'ShipLog' }],
  openGraph: {
    title: 'ShipLog - Release notes that ship themselves',
    description: 'One release. Every audience. Zero effort.',
    url: 'https://shiplog.io',
    siteName: 'ShipLog',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ShipLog',
    description: 'Release notes that ship themselves',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
