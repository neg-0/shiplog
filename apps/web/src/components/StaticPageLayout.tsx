import { Ship } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

export default function StaticPageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-navy-100 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Ship className="w-7 h-7 text-teal-600" />
              <span className="text-lg font-bold text-navy-900">ShipLog</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/docs" className="text-navy-600 hover:text-navy-900 transition text-sm">
                Docs
              </Link>
              <Link href="/changelog" className="text-navy-600 hover:text-navy-900 transition text-sm">
                Changelog
              </Link>
              <Link href="/#pricing" className="text-navy-600 hover:text-navy-900 transition text-sm">
                Pricing
              </Link>
              <Link 
                href="/login"
                className="bg-navy-900 text-white px-4 py-2 rounded-lg hover:bg-navy-800 transition text-sm"
              >
                Login
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-navy-100 py-12 bg-navy-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Ship className="w-5 h-5 text-teal-600" />
              <span className="font-semibold text-navy-900">ShipLog</span>
            </div>
            <nav className="flex flex-wrap gap-6 text-sm">
              <Link href="/docs" className="text-navy-600 hover:text-navy-900">Docs</Link>
              <Link href="/changelog" className="text-navy-600 hover:text-navy-900">Changelog</Link>
              <Link href="/terms" className="text-navy-600 hover:text-navy-900">Terms</Link>
              <Link href="/privacy" className="text-navy-600 hover:text-navy-900">Privacy</Link>
            </nav>
          </div>
          <p className="text-center text-navy-500 text-sm mt-8">
            © 2026 ShipLog. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
