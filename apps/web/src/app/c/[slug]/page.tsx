import { Ship, Tag, Calendar, ExternalLink, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.shiplog.io';

interface Release {
  id: string;
  version: string;
  name: string | null;
  date: string;
  notes: { id: string; audience: string; content: string }[];
}

interface ChangelogData {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  showPoweredBy: boolean;
  releases: Release[];
}

async function getChangelog(slug: string): Promise<ChangelogData | null> {
  try {
    const res = await fetch(`${API_URL}/public/${slug}`, {
      next: { revalidate: 60 }, // Cache for 1 minute
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const data = await getChangelog(params.slug);
  if (!data) return { title: 'Changelog Not Found' };
  
  return {
    title: `${data.name} Changelog | ShipLog`,
    description: data.description || `Release notes and changelog for ${data.name}`,
    openGraph: {
      title: `${data.name} Changelog`,
      description: data.description || `Release notes and changelog for ${data.name}`,
    },
  };
}

export default async function PublicChangelogPage({ params }: { params: { slug: string } }) {
  const data = await getChangelog(params.slug);
  
  if (!data) {
    notFound();
  }

  const accentColor = data.accentColor || '#0d9488'; // Default teal

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 py-6">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-4">
            {data.logoUrl ? (
              <img src={data.logoUrl} alt="" className="w-12 h-12 rounded-xl" />
            ) : (
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${accentColor}20` }}
              >
                <Tag className="w-6 h-6" style={{ color: accentColor }} />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
              {data.description && (
                <p className="text-gray-600">{data.description}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Releases */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {data.releases.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No releases yet</p>
          </div>
        ) : (
          <div className="space-y-8">
            {data.releases.map((release) => (
              <article key={release.id} className="border-b border-gray-100 pb-8 last:border-0">
                <div className="flex items-center gap-3 mb-4">
                  <span 
                    className="px-3 py-1 rounded-full text-sm font-semibold"
                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                  >
                    {release.version}
                  </span>
                  <span className="text-gray-500 text-sm flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(release.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>

                {release.name && (
                  <h2 className="text-xl font-semibold text-gray-900 mb-3">{release.name}</h2>
                )}

                {/* Show first audience notes (usually Customer) */}
                {release.notes.length > 0 && (
                  <div className="prose prose-gray max-w-none">
                    <div 
                      className="text-gray-700"
                      dangerouslySetInnerHTML={{ 
                        __html: release.notes[0].content.replace(/\n/g, '<br>') 
                      }}
                    />
                  </div>
                )}

                <Link
                  href={`/c/${params.slug}/${release.version}`}
                  className="inline-flex items-center gap-1 mt-4 text-sm font-medium hover:underline"
                  style={{ color: accentColor }}
                >
                  View full release notes
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      {data.showPoweredBy && (
        <footer className="border-t border-gray-100 py-6">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <Link 
              href="https://shiplog.io" 
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <Ship className="w-4 h-4" />
              Powered by ShipLog
            </Link>
          </div>
        </footer>
      )}
    </div>
  );
}
