import StaticPageLayout from '../../components/StaticPageLayout';
import { Tag } from 'lucide-react';

export const metadata = {
  title: 'Changelog | ShipLog',
  description: 'See what\'s new in ShipLog - the latest features, improvements, and fixes.',
};

const releases = [
  {
    version: 'v1.1.0',
    date: 'February 2026',
    changes: [
      { type: 'feature', text: 'Added Organizations for team collaboration' },
      { type: 'feature', text: 'Admin dashboard for platform management' },
      { type: 'feature', text: 'Public changelog pages with custom branding (Pro)' },
      { type: 'feature', text: 'Activity feed showing recent releases' },
      { type: 'improvement', text: 'Improved markdown rendering in release notes' },
      { type: 'improvement', text: 'Better mobile responsiveness across dashboard' },
    ],
  },
  {
    version: 'v1.0.0',
    date: 'February 2026',
    changes: [
      { type: 'feature', text: 'AI-powered release notes generation' },
      { type: 'feature', text: 'GitHub integration with webhook support' },
      { type: 'feature', text: 'Multiple audience support (Developers, Customers, Stakeholders)' },
      { type: 'feature', text: 'Slack and Discord webhook distribution' },
      { type: 'feature', text: 'Pro and Team subscription plans' },
      { type: 'feature', text: '14-day free trial for Pro features' },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <StaticPageLayout>
      <article>
        <h1 className="text-3xl font-bold text-navy-900 mb-2">Changelog</h1>
        <p className="text-lg text-navy-600 mb-8">
          What&apos;s new in ShipLog — features, improvements, and fixes.
        </p>

        <div className="space-y-12">
          {releases.map((release) => (
            <section key={release.version} className="relative pl-8 border-l-2 border-navy-200">
              <div className="absolute -left-3 top-0 w-6 h-6 bg-teal-100 rounded-full flex items-center justify-center">
                <Tag className="w-3 h-3 text-teal-600" />
              </div>
              
              <div className="mb-4">
                <h2 className="text-xl font-bold text-navy-900">{release.version}</h2>
                <p className="text-navy-500">{release.date}</p>
              </div>

              <ul className="space-y-3">
                {release.changes.map((change, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium mt-0.5 ${
                      change.type === 'feature' ? 'bg-teal-100 text-teal-700' :
                      change.type === 'improvement' ? 'bg-blue-100 text-blue-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {change.type}
                    </span>
                    <span className="text-navy-700">{change.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </article>
    </StaticPageLayout>
  );
}
