'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, ArrowLeft, ExternalLink, Tag, Users, Sparkles, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRepo, disconnectRepo, isAuthenticated, type RepoDetail } from '../../../../lib/api';

export default function RepoDetailPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchRepo = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRepo(repoId);
        setRepo(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load repository');
      } finally {
        setLoading(false);
      }
    };

    fetchRepo();
  }, [repoId, router]);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this repository? This will remove the webhook and all release data.')) {
      return;
    }

    try {
      setDisconnecting(true);
      await disconnectRepo(repoId);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect repository');
      setDisconnecting(false);
    }
  };

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
            Back to Repositories
          </Link>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-800">Error</h3>
                <p className="text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Repo Content */}
          {repo && !loading && (
            <>
              {/* Repo Header */}
              <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 lg:w-16 lg:h-16 bg-navy-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <GitBranch className="w-6 h-6 lg:w-8 lg:h-8 text-navy-600" />
                    </div>
                    <div>
                      <h1 className="text-xl lg:text-2xl font-bold text-navy-900">{repo.fullName}</h1>
                      <p className="text-navy-600">{repo.description || 'No description'}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {repo.status === 'ACTIVE' ? (
                          <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded-full">
                            Active
                          </span>
                        ) : repo.status === 'ERROR' ? (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            Webhook Error
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                            {repo.status}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <a 
                      href={`https://github.com/${repo.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-sm text-navy-600 border border-navy-200 rounded-lg hover:bg-navy-50 transition flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on GitHub
                    </a>
                    <button className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Generate Changelog
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Releases */}
                <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center gap-3 mb-4">
                    <Tag className="w-5 h-5 text-navy-600" />
                    <h2 className="text-lg font-semibold text-navy-900">Recent Releases</h2>
                  </div>
                  {repo.releases && repo.releases.length > 0 ? (
                    <div className="space-y-3">
                      {repo.releases.map((release) => (
                        <div key={release.id} className="flex items-center justify-between py-2 border-b border-navy-100 last:border-0">
                          <div>
                            <p className="font-medium text-navy-900">{release.tagName}</p>
                            <p className="text-sm text-navy-500">{release.name || 'No title'}</p>
                          </div>
                          <span className="text-sm text-navy-400">{formatRelativeDate(release.publishedAt)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-navy-500">No releases yet. Create a GitHub release to see it here.</p>
                  )}
                </div>

                {/* Config */}
                <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center gap-3 mb-4">
                    <Users className="w-5 h-5 text-navy-600" />
                    <h2 className="text-lg font-semibold text-navy-900">Audiences</h2>
                  </div>
                  {repo.config ? (
                    <div className="space-y-2">
                      {repo.config.generateCustomer && (
                        <div className="px-3 py-2 bg-navy-50 rounded-lg text-navy-700">
                          Customers
                        </div>
                      )}
                      {repo.config.generateDeveloper && (
                        <div className="px-3 py-2 bg-navy-50 rounded-lg text-navy-700">
                          Developers
                        </div>
                      )}
                      {repo.config.generateStakeholder && (
                        <div className="px-3 py-2 bg-navy-50 rounded-lg text-navy-700">
                          Stakeholders
                        </div>
                      )}
                      <button className="w-full px-3 py-2 border border-dashed border-navy-300 rounded-lg text-navy-500 hover:border-teal-400 hover:text-teal-600 transition">
                        + Configure Audiences
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-navy-500 mb-4">No configuration yet.</p>
                      <button className="px-4 py-2 text-sm bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition">
                        Configure Audiences
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center gap-3 mb-4">
                    <Tag className="w-5 h-5 text-navy-600" />
                    <h2 className="text-lg font-semibold text-navy-900">Stats</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-2xl font-bold text-navy-900">{repo.releases?.length || 0}</p>
                      <p className="text-sm text-navy-500">Total Releases</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-navy-900">
                        {(repo.config?.generateCustomer ? 1 : 0) + 
                         (repo.config?.generateDeveloper ? 1 : 0) + 
                         (repo.config?.generateStakeholder ? 1 : 0)}
                      </p>
                      <p className="text-sm text-navy-500">Audiences</p>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-red-200">
                  <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
                  <p className="text-navy-600 text-sm mb-4">
                    Disconnecting this repository will remove the webhook and delete all release data.
                  </p>
                  <button 
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition flex items-center gap-2 disabled:opacity-50"
                  >
                    {disconnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Disconnect Repository
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
