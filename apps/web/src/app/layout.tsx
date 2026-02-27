import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://shiplog.io'),
  title: 'ShipLog - Release notes that ship themselves',
  description: 'Automatically generate and distribute release notes tailored for customers, developers, and execs — from your GitHub releases.',
  keywords: ['changelog', 'release notes', 'github', 'automation', 'developer tools', 'saas', 'changelog generator', 'ai changelog'],
  authors: [{ name: 'ShipLog' }],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ShipLog - Release notes that ship themselves',
    description: 'One release. Every audience. Zero effort. AI-generated changelogs for customers, developers, and stakeholders.',
    url: 'https://shiplog.io',
    siteName: 'ShipLog',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: 'https://shiplog.io/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'ShipLog - Release notes that ship themselves',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ShipLog',
    description: 'Release notes that ship themselves. One commit -> Three audiences.',
    images: ['https://shiplog.io/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
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
