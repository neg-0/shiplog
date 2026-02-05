'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, ArrowLeft, Loader2, AlertCircle, Check, Search } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAvailableRepos, connectRepo, createCheckoutSession, isAuthenticated, type GitHubRepo } from '../../../../lib/api';

export default function ConnectRepoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<GitHubRepo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<number | null>(null);
  const [connected, setConnected] = useState<Set<number>>(new Set());
  const [upgradePrompt, setUpgradePrompt] = useState<{ requiredTier: 'PRO' | 'TEAM'; message: string } | null>(null);
  
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
        const data = await getAvailableRepos();
        setRepos(data.repos);
        setFilteredRepos(data.repos);
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
    <div className="min-h-screen bg-navy-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-navy-900 text-white p-4 z-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ship className="w-6 h-6 text-teal-400" />
          <span className="text-lg font-bold">ShipLog</span>
        </div>
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-navy-800 rounded-lg transition"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full w-64 bg-navy-900 text-white p-6 z-50
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex items-center gap-2 mb-8 mt-2 lg:mt-0">
          <Ship className="w-8 h-8 text-teal-400" />
          <span className="text-xl font-bold">ShipLog</span>
        </div>

        <nav className="space-y-2">
          <Link 
            href="/dashboard" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <GitBranch className="w-5 h-5" />
            Repositories
          </Link>
          <Link 
            href="/dashboard/activity" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition"
            onClick={() => setSidebarOpen(false)}
          >
            <Bell className="w-5 h-5" />
            Activity
          </Link>
          <Link 
            href="/dashboard/settings" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition"
            onClick={() => setSidebarOpen(false)}
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-center gap-3 px-4 py-3 bg-navy-800 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-navy-700" />
            <span className="font-medium flex-1">User</span>
            <button className="text-navy-400 hover:text-white transition">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8">
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
                    className={`px-4 py-2 rounded-lg font-medium transition flex items-center justify-center gap-2 w-full sm:w-auto ${
                      connected.has(repo.githubId)
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
      </main>
    </div>
  );
}
