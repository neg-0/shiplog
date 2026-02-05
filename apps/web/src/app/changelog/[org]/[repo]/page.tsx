'use client';

import { Ship, Calendar, Tag, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getChangelog, type Changelog } from '../../../../lib/api';

export default function ChangelogPage() {
  const params = useParams();
  const org = params.org as string;
  const repo = params.repo as string;
  
  const [changelog, setChangelog] = useState<Changelog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChangelog = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getChangelog(org, repo);
        setChangelog(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load changelog');
      } finally {
        setLoading(false);
      }
    };

    fetchChangelog();
  }, [org, repo]);

  const getNotesForAudience = (notes: Changelog['releases'][0]['notes']) => {
    if (!notes) return null;
    return notes.customer;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (error || !changelog) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-navy-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-navy-900 mb-2">Changelog Not Found</h1>
          <p className="text-navy-600 mb-6">
            {error || `No public changelog available for ${org}/${repo}`}
          </p>
          <Link 
            href="/"
            className="inline-block bg-navy-900 text-white px-6 py-3 rounded-lg hover:bg-navy-800 transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }
  
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
            {changelog.productName || `${org}/${repo}`}
          </h1>
          <p className="text-navy-600">{changelog.description || 'Changelog and release notes'}</p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-teal-100 px-4 py-2 text-sm font-medium text-teal-700">
            Customer Release Notes
          </div>
        </div>
      </header>

      {/* Releases */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {changelog.releases.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="w-12 h-12 text-navy-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-navy-900 mb-2">No releases yet</h2>
            <p className="text-navy-600">Release notes will appear here when published.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {changelog.releases.map((release) => {
              const notes = getNotesForAudience(release.notes);
              
              return (
                <article key={release.version} className="relative">
                  {/* Version Badge */}
                  <div className="flex flex-wrap items-center gap-4 mb-4">
                    <span className="flex items-center gap-2 bg-teal-100 text-teal-700 px-3 py-1 rounded-full font-semibold">
                      <Tag className="w-4 h-4" />
                      {release.version}
                    </span>
                    {release.date && (
                      <span className="flex items-center gap-2 text-navy-500">
                        <Calendar className="w-4 h-4" />
                        {new Date(release.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    )}
                    <a 
                      href={release.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-navy-400 hover:text-navy-600 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      GitHub
                    </a>
                  </div>

                  {/* Content */}
                  <div className="bg-navy-50 rounded-xl p-6 border border-navy-100">
                    {notes ? (
                      <div 
                        className="prose prose-navy max-w-none"
                        dangerouslySetInnerHTML={{ 
                          __html: notes
                            .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-navy-900 mt-4 mb-2 first:mt-0">$1</h3>')
                            .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-navy-900 mt-6 mb-3 first:mt-0">$1</h2>')
                            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                            .replace(/`(.+?)`/g, '<code class="bg-navy-200 px-1 rounded text-sm">$1</code>')
                            .replace(/^- (.+)$/gm, '<li class="text-navy-700 ml-4">$1</li>')
                            .replace(/\n\n/g, '<br/><br/>')
                        }}
                      />
                    ) : (
                      <p className="text-navy-500 italic">No notes available for this audience.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
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
