'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { AlertCircle, GitBranch, Loader2, Plus, RefreshCw, Ship } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { getRepos, getUser, isAuthenticated, setToken, type Repo, type User } from '../../lib/api';

function DashboardContent() {

  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle token from OAuth callback
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      // Remove token from URL
      router.replace('/dashboard');
    }
  }, [searchParams, router]);

  // Check auth and fetch repos
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [repoData, userData] = await Promise.all([
          getRepos(),
          getUser(),
        ]);

        setRepos(repoData.repos);
        setUser(userData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);



  const formatRelativeDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-navy-900">Repositories</h1>
              {user && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">
                  {user.subscriptionTier} Plan
                </span>
              )}
            </div>
            <p className="text-navy-600">Manage your connected repos and release settings</p>
          </div>
          <Link
            href="/dashboard/repos/connect"
            className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-500 transition flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            Connect Repo
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-800">Failed to load repositories</h3>
              <p className="text-red-600 mt-1">{error}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="text-red-600 hover:text-red-800 transition"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Repo List */}
        {!loading && !error && repos.length > 0 && (
          <div className="space-y-4">
            {repos.map((repo) => (
              <Link
                key={repo.id}
                href={`/dashboard/repos/${repo.id}`}
                className="block bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100 hover:shadow-md hover:border-teal-200 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-5 h-5 lg:w-6 lg:h-6 text-navy-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-navy-900 truncate">{repo.fullName}</h3>
                      {repo.lastRelease ? (
                        <p className="text-sm text-navy-500">
                          Last release: <span className="font-medium">{repo.lastRelease}</span> · {formatRelativeDate(repo.lastReleaseDate)}
                        </p>
                      ) : (
                        <p className="text-sm text-navy-400">No releases yet</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {repo.status === 'ACTIVE' ? (
                      <span className="px-3 py-1 bg-teal-100 text-teal-700 text-sm font-medium rounded-full">
                        Active
                      </span>
                    ) : repo.status === 'ERROR' ? (
                      <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                        Error
                      </span>
                    ) : repo.status === 'PAUSED' ? (
                      <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                        Paused
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
                        Setup needed
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && repos.length === 0 && (
          <div className="bg-white rounded-xl p-8 lg:p-12 text-center border border-navy-100">
            <Ship className="w-12 h-12 lg:w-16 lg:h-16 text-navy-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-navy-900 mb-2">No repos connected</h3>
            <p className="text-navy-600 mb-6">Connect your first GitHub repository to get started</p>
            <Link
              href="/dashboard/repos/connect"
              className="inline-block bg-navy-900 text-white px-6 py-3 rounded-lg hover:bg-navy-800 transition"
            >
              Connect Repository
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}


export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-navy-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
