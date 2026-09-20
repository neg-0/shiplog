'use client';

import { Ship, Tag, Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

interface ReleaseData {
  repoName: string;
  id: string;
  version: string;
  name: string | null;
  body: string | null;
  date: string;
  notes: { customer: string | null; developer: string | null; stakeholder: string | null } | null;
  showPoweredBy?: boolean;
}

export default function ReleaseDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const version = params.version as string;

  const [data, setData] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const fetchRelease = async () => {
      setLoading(true);
      setError(false);
      setActiveIndex(0);
      try {
        const res = await fetch(`/api/public/${encodeURIComponent(slug)}/releases/${encodeURIComponent(version)}`, { signal: controller.signal });
        if (res.status === 404) {
          setData(null);
          return;
        }
        if (!res.ok) throw new Error('Failed to load release');
        setData(await res.json());
      } catch {
        if (controller.signal.aborted) return;
        setData(null);
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchRelease();
    return () => controller.abort();
  }, [slug, version]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{error ? 'Unable to load this release' : 'Release Not Found'}</h1>
          {error && <p role="alert" className="mb-4 text-gray-600">Please refresh the page to try again.</p>}
          <Link href={`/c/${slug}`} className="text-teal-600 hover:underline">
            Back to changelog
          </Link>
        </div>
      </div>
    );
  }

  const notes = Object.entries(data.notes || {})
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0)
    .map(([audience, content]) => ({ audience, content }));

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 py-6">
        <div className="max-w-3xl mx-auto px-4">
          <Link
            href={`/c/${slug}`}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to changelog
          </Link>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <Tag className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.repoName}</h1>
              <div className="flex items-center gap-3 text-gray-600">
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-sm font-semibold">
                  {data.version}
                </span>
                <span className="flex items-center gap-1 text-sm">
                  <Calendar className="w-4 h-4" />
                  {new Date(data.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {data.name && (
          <h2 className="text-xl font-semibold text-gray-900 mb-6">{data.name}</h2>
        )}

        {/* Audience Tabs */}
        {notes.length > 1 && (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto border-b border-gray-200" role="tablist" aria-label="Release note audience">
              {notes.map((note, i) => (
                <button
                  key={note.audience}
                  role="tab"
                  id={`audience-${note.audience}`}
                  aria-selected={i === activeIndex}
                  aria-controls="release-note-content"
                  tabIndex={i === activeIndex ? 0 : -1}
                  onClick={() => setActiveIndex(i)}
                  onKeyDown={event => {
                    const nextIndex = event.key === 'ArrowRight' ? (i + 1) % notes.length
                      : event.key === 'ArrowLeft' ? (i - 1 + notes.length) % notes.length
                      : event.key === 'Home' ? 0 : event.key === 'End' ? notes.length - 1 : null;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    setActiveIndex(nextIndex);
                    (event.currentTarget.parentElement?.querySelectorAll('button')[nextIndex] as HTMLButtonElement | undefined)?.focus();
                  }}
                  className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition ${
                    i === activeIndex
                      ? 'border-teal-600 text-teal-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {note.audience}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes Content */}
        {notes[activeIndex] ? (
          <div id="release-note-content" role={notes.length > 1 ? 'tabpanel' : undefined} aria-labelledby={notes.length > 1 ? `audience-${notes[activeIndex].audience}` : undefined} className="prose prose-gray max-w-none">
            <ReactMarkdown>{notes[activeIndex].content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-gray-500">No release notes available.</p>
        )}
      </main>

      {/* Footer */}
      {data.showPoweredBy !== false && <footer className="border-t border-gray-100 py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <Link
            href="https://shiplog.io"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <Ship className="w-4 h-4" />
            Powered by ShipLog
          </Link>
        </div>
      </footer>}
    </div>
  );
}
