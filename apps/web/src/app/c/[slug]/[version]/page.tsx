import { Ship, Tag, Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.shiplog.io';

interface ReleaseData {
  repoName: string;
  id: string;
  version: string;
  name: string | null;
  body: string | null;
  date: string;
  notes: { id: string; audience: string; content: string }[];
}

async function getRelease(slug: string, version: string): Promise<ReleaseData | null> {
  try {
    const res = await fetch(`${API_URL}/public/${slug}/releases/${version}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string; version: string } }) {
  const data = await getRelease(params.slug, params.version);
  if (!data) return { title: 'Release Not Found' };
  
  return {
    title: `${data.repoName} ${data.version} | ShipLog`,
    description: `Release notes for ${data.repoName} version ${data.version}`,
    openGraph: {
      title: `${data.repoName} ${data.version}`,
      description: `Release notes for ${data.repoName} version ${data.version}`,
    },
    twitter: {
      card: 'summary',
      title: `${data.repoName} ${data.version}`,
      description: `Release notes for ${data.repoName} version ${data.version}`,
    },
  };
}

export default async function ReleaseDetailPage({ params }: { params: { slug: string; version: string } }) {
  const data = await getRelease(params.slug, params.version);
  
  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 py-6">
        <div className="max-w-3xl mx-auto px-4">
          <Link 
            href={`/c/${params.slug}`}
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
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                    i === 0 
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
        {data.notes.length > 0 ? (
          <div className="prose prose-gray max-w-none">
            <div 
              className="text-gray-700 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ 
                __html: data.notes[0].content.replace(/\n/g, '<br>') 
              }}
            />
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
