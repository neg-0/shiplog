import { Ship, ArrowRight, Search } from 'lucide-react';
import Link from 'next/link';

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-navy-900 to-navy-800">
      {/* Header */}
      <header className="border-b border-navy-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Ship className="w-8 h-8 text-teal-400" />
            <span className="text-xl font-bold text-white">ShipLog</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/login" className="text-white hover:text-teal-400 transition font-medium">
              Login
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6">
          Public Changelogs
        </h1>
        <p className="text-xl text-navy-300 mb-8">
          Browse changelogs from projects using ShipLog. See how teams communicate updates to their users.
        </p>

        {/* Search (placeholder) */}
        <div className="max-w-lg mx-auto relative mb-12">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" />
          <input
            type="text"
            placeholder="Search for a project (e.g. neg-0/shiplog)"
            className="w-full pl-12 pr-4 py-3 bg-navy-800 border border-navy-600 rounded-xl text-white placeholder-navy-400 focus:outline-none focus:border-teal-500 transition"
          />
        </div>

        {/* Featured Projects */}
        <div className="text-left">
          <h2 className="text-lg font-semibold text-navy-300 mb-4">Featured Projects</h2>
          <div className="grid gap-4">
            <Link 
              href="/changelog/neg-0/comp-iq"
              className="bg-navy-800/50 border border-navy-700 rounded-xl p-6 hover:border-teal-500 transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-teal-400 transition">
                    neg-0/comp-iq
                  </h3>
                  <p className="text-navy-400 text-sm">Commercial real estate analytics platform</p>
                </div>
                <ArrowRight className="w-5 h-5 text-navy-500 group-hover:text-teal-400 transition" />
              </div>
            </Link>

            <Link 
              href="/changelog/neg-0/shiplog"
              className="bg-navy-800/50 border border-navy-700 rounded-xl p-6 hover:border-teal-500 transition group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-teal-400 transition">
                    neg-0/shiplog
                  </h3>
                  <p className="text-navy-400 text-sm">Multi-audience release notes that ship themselves</p>
                </div>
                <ArrowRight className="w-5 h-5 text-navy-500 group-hover:text-teal-400 transition" />
              </div>
            </Link>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 p-8 bg-gradient-to-r from-teal-600/20 to-navy-700/20 rounded-2xl border border-teal-500/30">
          <h3 className="text-xl font-semibold text-white mb-2">
            Want your own public changelog?
          </h3>
          <p className="text-navy-300 mb-4">
            Connect your GitHub repo and let ShipLog generate beautiful, multi-audience release notes automatically.
          </p>
          <Link 
            href="/login"
            className="inline-flex items-center gap-2 bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-500 transition font-medium"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-navy-700 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-navy-400 text-sm">
          <p>© 2026 ShipLog. Built with ❤️ for developers.</p>
        </div>
      </footer>
    </div>
  );
}
