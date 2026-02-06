'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { AlertCircle, ArrowLeft, Check, GitBranch, Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { connectRepo, createCheckoutSession, getAvailableRepos, getUser, isAuthenticated, type GitHubRepo, type User } from '../../../../lib/api';

export default function ConnectRepoPage() {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [connected, setConnected] = useState<Set<number>>(new Set());
  const [upgradePrompt, setUpgradePrompt] = useState<{ requiredTier: 'PRO' | 'TEAM'; message: string } | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchRepos = async () => {
      try {
        setLoading(true);
        setError(null);
        const [data, userData] = await Promise.all([
          getAvailableRepos(),
          getUser()
        ]);
        setRepos(data.repos);
        setFilteredRepos(data.repos);
        setUser(userData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repositories');
      } finally {
        setLoading(false);
      }
    };

    fetchRepos();
  }, [router]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredRepos(repos);
    } else {
      const q = search.toLowerCase();
      setFilteredRepos(repos.filter(r =>
        r.fullName.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q)
      ));
    }
  }, [search, repos]);

  const handleConnect = async (repo: GitHubRepo) => {
    try {
      setError(null);
      setUpgradePrompt(null);
      setConnecting(repo.githubId);
      await connectRepo(repo);
      setConnected(prev => new Set(prev).add(repo.githubId));
      // Remove from available list after short delay
      setTimeout(() => {
        setRepos(prev => prev.filter(r => r.githubId !== repo.githubId));
      }, 1000);
    } catch (err) {
      const errorObj = err as Error & { status?: number; data?: { upgradeRequired?: boolean; requiredTier?: 'PRO' | 'TEAM' } };
      if (errorObj.status === 403 && errorObj.data?.upgradeRequired) {
        setUpgradePrompt({
          requiredTier: errorObj.data.requiredTier ?? 'PRO',
          message: errorObj.message,
        });
      } else {
        setError(errorObj.message || 'Failed to connect repository');
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleUpgrade = async () => {
    if (!upgradePrompt) return;
    const plan = upgradePrompt.requiredTier === 'TEAM' ? 'team' : 'pro';
    const session = await createCheckoutSession(plan);
    if (session.url) {
      window.location.href = session.url;
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-900">Connect Repository</h1>
          <p className="text-navy-600">Select a GitHub repository to connect to ShipLog</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {upgradePrompt && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-teal-800 font-medium">Upgrade required</p>
              <p className="text-teal-700 text-sm">{upgradePrompt.message}</p>
            </div>
            <button
              onClick={handleUpgrade}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition"
            >
              Upgrade to {upgradePrompt.requiredTier}
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          </div>
        )}

        {/* Repo List */}
        {!loading && filteredRepos.length > 0 && (
          <div className="space-y-3">
            {filteredRepos.map((repo) => (
              <div
                key={repo.githubId}
                className="bg-white rounded-xl p-4 lg:p-5 shadow-sm border border-navy-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-5 h-5 text-navy-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-navy-900 truncate">{repo.fullName}</h3>
                    {repo.description && (
                      <p className="text-sm text-navy-500 truncate">{repo.description}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleConnect(repo)}
                  disabled={connecting === repo.githubId || connected.has(repo.githubId)}
                  className={`px-4 py-2 rounded-lg font-medium transition flex items-center justify-center gap-2 w-full sm:w-auto ${connected.has(repo.githubId)
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50'
                    }`}
                >
                  {connecting === repo.githubId ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : connected.has(repo.githubId) ? (
                    <>
                      <Check className="w-4 h-4" />
                      Connected
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty Search */}
        {!loading && filteredRepos.length === 0 && repos.length > 0 && (
          <div className="bg-white rounded-xl p-8 text-center border border-navy-100">
            <Search className="w-12 h-12 text-navy-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-navy-900 mb-2">No matching repositories</h3>
            <p className="text-navy-600">Try a different search term</p>
          </div>
        )}

        {/* No Repos */}
        {!loading && repos.length === 0 && !error && (
          <div className="bg-white rounded-xl p-8 text-center border border-navy-100">
            <GitBranch className="w-12 h-12 text-navy-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-navy-900 mb-2">All repositories connected</h3>
            <p className="text-navy-600 mb-4">You&apos;ve already connected all your GitHub repositories</p>
            <Link
              href="/dashboard"
              className="inline-block bg-navy-900 text-white px-6 py-3 rounded-lg hover:bg-navy-800 transition"
            >
              Back to Dashboard
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
