import { Ship, Calendar, Tag, ExternalLink } from 'lucide-react';
import Link from 'next/link';

// Mock data - would come from API
const mockChangelog = {
  org: 'neg-0',
  repo: 'comp-iq',
  releases: [
    {
      version: 'v2.4.0',
      date: '2026-02-01',
      customer: `### What's New 🚀

**PDF Export is here!** You can now export your comp reports directly to PDF with one click. Perfect for sharing with clients or keeping offline records.

**Improved Map Performance** — The property map now loads 3x faster, especially when viewing 100+ properties.

**Quick Filters** — New filter chips at the top of the property list let you narrow down by type, status, or market instantly.

### Bug Fixes
- Fixed an issue where lease dates weren't saving correctly on mobile
- Address autocomplete now works more reliably`,
      developer: `## v2.4.0 (2026-02-01)

### Features
- \`feat(reports)\`: Add PDF export via Puppeteer headless rendering (#412)
- \`feat(map)\`: Implement map tile caching with 24h TTL (#408)
- \`feat(filters)\`: Add FilterChips component with URL sync (#415)

### Fixes
- \`fix(leases)\`: Correct date picker timezone handling on mobile Safari (#410)
- \`fix(geocoding)\`: Add fallback to NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN for server routes (#418)

### Breaking Changes
- None

### Migration Notes
- Run \`pnpm prisma migrate deploy\` for new report_exports table`,
      stakeholder: `## Release Summary: v2.4.0

**Shipped:** February 1, 2026

### Key Deliverables
- ✅ PDF Export (Q1 Goal #3) — Complete
- ✅ Performance improvements — Map load time reduced by 67%
- ✅ UX polish — New quick filters for faster workflow

### Metrics
- 4 features shipped
- 2 bugs fixed
- 0 breaking changes
- Estimated user time saved: 5 min/day for power users

### Next Up
- Dashboard analytics (in progress)
- Multi-market rollup reports (planned)`,
    },
    {
      version: 'v2.3.1',
      date: '2026-01-28',
      customer: `### Bug Fixes 🔧

Fixed an issue where some users couldn't see their recently added properties. Everything should be back to normal now!`,
      developer: `## v2.3.1 (2026-01-28)

### Fixes
- \`fix(rls)\`: Update RLS policy to allow independent brokers to view their own properties (#405)`,
      stakeholder: `## Hotfix: v2.3.1

**Shipped:** January 28, 2026

Critical RLS policy fix affecting independent broker accounts. No new features.`,
    },
  ],
};

export default function ChangelogPage({ 
  params 
}: { 
  params: { org: string; repo: string } 
}) {
  const { org, repo } = params;
  
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-navy-100 bg-navy-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-4">
            <Ship className="w-6 h-6 text-teal-600" />
            <span className="text-navy-400">Powered by ShipLog</span>
          </div>
          <h1 className="text-3xl font-bold text-navy-900 mb-2">
            {org}/{repo}
          </h1>
          <p className="text-navy-600">Changelog and release notes</p>
          
          {/* Audience Tabs */}
          <div className="flex gap-2 mt-6">
            <button className="px-4 py-2 bg-navy-900 text-white rounded-lg font-medium">
              Customer View
            </button>
            <button className="px-4 py-2 bg-white text-navy-600 rounded-lg font-medium border border-navy-200 hover:border-navy-300 transition">
              Developer View
            </button>
            <button className="px-4 py-2 bg-white text-navy-600 rounded-lg font-medium border border-navy-200 hover:border-navy-300 transition">
              Stakeholder View
            </button>
          </div>
        </div>
      </header>

      {/* Releases */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="space-y-12">
          {mockChangelog.releases.map((release) => (
            <article key={release.version} className="relative">
              {/* Version Badge */}
              <div className="flex items-center gap-4 mb-4">
                <span className="flex items-center gap-2 bg-teal-100 text-teal-700 px-3 py-1 rounded-full font-semibold">
                  <Tag className="w-4 h-4" />
                  {release.version}
                </span>
                <span className="flex items-center gap-2 text-navy-500">
                  <Calendar className="w-4 h-4" />
                  {new Date(release.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <a 
                  href={`https://github.com/${org}/${repo}/releases/tag/${release.version}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-navy-400 hover:text-navy-600 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  GitHub
                </a>
              </div>

              {/* Content */}
              <div className="prose prose-navy max-w-none">
                <div 
                  className="bg-navy-50 rounded-xl p-6 border border-navy-100"
                  dangerouslySetInnerHTML={{ 
                    __html: release.customer
                      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-navy-900 mt-4 mb-2">$1</h3>')
                      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-navy-900 mt-6 mb-3">$1</h2>')
                      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                      .replace(/`(.+?)`/g, '<code class="bg-navy-200 px-1 rounded text-sm">$1</code>')
                      .replace(/^- (.+)$/gm, '<li class="text-navy-700">$1</li>')
                      .replace(/\n\n/g, '<br/><br/>')
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-navy-100 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Link 
            href="https://shiplog.io"
            className="inline-flex items-center gap-2 text-navy-400 hover:text-navy-600 transition"
          >
            <Ship className="w-5 h-5" />
            Changelog powered by ShipLog
          </Link>
        </div>
      </footer>
    </div>
  );
}
