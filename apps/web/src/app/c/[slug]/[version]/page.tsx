'use client';

import { Ship, Tag, Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface ReleaseData {
  repoName: string;
  id: string;
  version: string;
  name: string | null;
  body: string | null;
  date: string;
  notes: { id: string; audience: string; content: string }[];
}

export default function ReleaseDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const version = params.version as string;

  const [data, setData] = useState<ReleaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const fetchRelease = async () => {
      try {
        const apiBase = API_URL || window.location.origin;
        const res = await fetch(`${apiBase}/api/public/${slug}/releases/${version}`);
        if (!res.ok) {
          setData(null);
          return;
        }
        setData(await res.json());
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchRelease();
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
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Release Not Found</h1>
          <Link href={`/c/${slug}`} className="text-teal-600 hover:underline">
            Back to changelog
          </Link>
        </div>
      </div>
    );
  }

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
        {data.notes.length > 1 && (
          <div className="mb-6">
            <div className="flex gap-2 border-b border-gray-200">
              {data.notes.map((note, i) => (
                <button
                  key={note.id}
                  onClick={() => setActiveIndex(i)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
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
        {data.notes.length > 0 && data.notes[activeIndex] ? (
          <div className="prose prose-gray max-w-none">
            <ReactMarkdown>{data.notes[activeIndex].content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-gray-500">No release notes available.</p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 mt-12">
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
    </div>
  );
}
