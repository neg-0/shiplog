'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, ArrowLeft, ExternalLink, Tag, Users, Sparkles, Loader2, AlertCircle, Trash2, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { addChannel, deleteChannel, disconnectRepo, getRepo, isAuthenticated, updateChannel, type Channel, type RepoDetail } from '../../../../lib/api';

export default function RepoDetailPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelForm, setChannelForm] = useState<Omit<Channel, 'id'>>({
    type: 'SLACK',
    name: '',
    webhookUrl: '',
    audience: 'CUSTOMER',
    enabled: true,
  });
  const [showWebhookHelp, setShowWebhookHelp] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ channelId: string; name: string } | null>(null);
  
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
        setChannels(data.config?.channels ?? []);
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

  const handleAddChannel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChannelError(null);

    if (!channelForm.webhookUrl || !channelForm.name) {
      setChannelError('Name and webhook URL are required.');
      return;
    }

    try {
      setChannelSaving(true);
      const created = await addChannel(repoId, channelForm);
      setChannels((prev) => [created, ...prev]);
      setChannelForm({
        type: 'SLACK',
        name: '',
        webhookUrl: '',
        audience: 'CUSTOMER',
        enabled: true,
      });
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : 'Failed to add channel');
    } finally {
      setChannelSaving(false);
    }
  };

  const handleUpdateChannel = async (channelId: string, updates: Partial<Channel>) => {
    setChannelError(null);
    try {
      const updated = await updateChannel(repoId, channelId, updates);
      setChannels((prev) => prev.map((channel) => (channel.id === channelId ? updated : channel)));
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : 'Failed to update channel');
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    setDeleteConfirm(null);
    setChannelError(null);
    try {
      await deleteChannel(repoId, channelId);
      setChannels((prev) => prev.filter((channel) => channel.id !== channelId));
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : 'Failed to delete channel');
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
                    {/* TODO: Wire up Generate Changelog functionality */}
                    {/* <button className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center justify-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Generate Changelog
                    </button> */}
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
                        <Link 
                          key={release.id} 
                          href={`/dashboard/releases/${release.id}`}
                          className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg border-b border-navy-100 last:border-0 hover:bg-navy-50 transition"
                        >
                          <div>
                            <p className="font-medium text-navy-900">{release.tagName}</p>
                            <p className="text-sm text-navy-500">{release.name || 'No title'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              release.status === 'PUBLISHED' ? 'bg-teal-100 text-teal-700' :
                              release.status === 'READY' ? 'bg-blue-100 text-blue-700' :
                              release.status === 'PROCESSING' ? 'bg-amber-100 text-amber-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {release.status}
                            </span>
                            <span className="text-sm text-navy-400">{formatRelativeDate(release.publishedAt)}</span>
                          </div>
                        </Link>
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

                {/* Distribution Channels */}
                <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center gap-3 mb-4">
                    <Bell className="w-5 h-5 text-navy-600" />
                    <h2 className="text-lg font-semibold text-navy-900">Distribution Channels</h2>
                  </div>

                  {channelError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
                      {channelError}
                    </div>
                  )}

                  <form onSubmit={handleAddChannel} className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs font-medium text-navy-500">Type</label>
                        <select
                          value={channelForm.type}
                          onChange={(event) =>
                            setChannelForm((prev) => ({
                              ...prev,
                              type: event.target.value as Channel['type'],
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                        >
                          <option value="SLACK">Slack</option>
                          <option value="DISCORD">Discord</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-navy-500">Audience</label>
                        <select
                          value={channelForm.audience}
                          onChange={(event) =>
                            setChannelForm((prev) => ({
                              ...prev,
                              audience: event.target.value as Channel['audience'],
                            }))
                          }
                          className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                        >
                          <option value="CUSTOMER">Customer</option>
                          <option value="DEVELOPER">Developer</option>
                          <option value="STAKEHOLDER">Stakeholder</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 items-end">
                      <div>
                        <label className="text-xs font-medium text-navy-500">Channel Name</label>
                        <input
                          value={channelForm.name}
                          onChange={(event) => setChannelForm((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="#announcements"
                          className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <label className="text-xs font-medium text-navy-500">Webhook URL</label>
                          <button
                            type="button"
                            onClick={() => setShowWebhookHelp(true)}
                            className="text-navy-400 hover:text-teal-600 transition"
                            title="How to get webhook URL"
                          >
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          value={channelForm.webhookUrl}
                          onChange={(event) => setChannelForm((prev) => ({ ...prev, webhookUrl: event.target.value }))}
                          placeholder={channelForm.type === 'SLACK' ? 'https://hooks.slack.com/services/...' : 'https://discord.com/api/webhooks/...'}
                          className="mt-1 w-full rounded-lg border border-navy-200 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={channelSaving}
                      className="w-full px-3 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition disabled:opacity-60"
                    >
                      {channelSaving ? 'Saving...' : 'Add Channel'}
                    </button>
                  </form>

                  <div className="mt-6 space-y-3">
                    {channels.length === 0 ? (
                      <p className="text-sm text-navy-500">No channels configured yet.</p>
                    ) : (
                      channels.map((channel) => (
                        <div key={channel.id} className="border border-navy-100 rounded-lg p-4 bg-navy-50/50">
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {/* Platform icon */}
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                                channel.type === 'SLACK' ? 'bg-[#4A154B]' : 'bg-[#5865F2]'
                              }`}>
                                {channel.type === 'SLACK' ? 'S' : 'D'}
                              </div>
                              <div>
                                <p className="font-semibold text-navy-900">{channel.name}</p>
                                <p className="text-xs text-navy-500">{channel.type === 'SLACK' ? 'Slack' : 'Discord'}</p>
                              </div>
                            </div>
                            {/* Status + Actions - stacked vertically */}
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col items-end gap-1.5">
                                <button
                                  onClick={() => handleUpdateChannel(channel.id, { enabled: !channel.enabled })}
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                                    channel.enabled 
                                      ? 'bg-teal-100 text-teal-700 hover:bg-teal-200' 
                                      : 'bg-navy-100 text-navy-500 hover:bg-navy-200'
                                  }`}
                                >
                                  {channel.enabled ? '● Active' : '○ Paused'}
                                </button>
                                <select
                                  value={channel.audience}
                                  onChange={(e) => handleUpdateChannel(channel.id, { audience: e.target.value as Channel['audience'] })}
                                  className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer font-medium ${
                                    channel.audience === 'CUSTOMER' ? 'bg-blue-100 text-blue-700' :
                                    channel.audience === 'DEVELOPER' ? 'bg-purple-100 text-purple-700' :
                                    'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  <option value="CUSTOMER">Customer</option>
                                  <option value="DEVELOPER">Developer</option>
                                  <option value="STAKEHOLDER">Stakeholder</option>
                                </select>
                              </div>
                              <button
                                onClick={() => setDeleteConfirm({ channelId: channel.id, name: channel.name })}
                                className="p-1.5 text-navy-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                                title="Remove channel"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
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

      {/* Webhook Help Modal */}
      {showWebhookHelp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowWebhookHelp(false)}>
          <div 
            className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-navy-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-navy-900">How to Get a Webhook URL</h2>
              <button 
                onClick={() => setShowWebhookHelp(false)}
                className="text-navy-400 hover:text-navy-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Slack Instructions */}
              <div>
                <h3 className="font-semibold text-navy-900 flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 bg-[#4A154B] rounded flex items-center justify-center text-white text-xs font-bold">S</span>
                  Slack Webhook
                </h3>
                <ol className="text-sm text-navy-600 space-y-2 list-decimal list-inside">
                  <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">api.slack.com/apps</a></li>
                  <li>Click <strong>Create New App</strong> → <strong>From scratch</strong></li>
                  <li>Name it (e.g., &quot;ShipLog&quot;) and select your workspace</li>
                  <li>Go to <strong>Incoming Webhooks</strong> in the sidebar</li>
                  <li>Toggle <strong>Activate Incoming Webhooks</strong> to On</li>
                  <li>Click <strong>Add New Webhook to Workspace</strong></li>
                  <li>Select the channel and click <strong>Allow</strong></li>
                  <li>Copy the webhook URL (starts with <code className="bg-navy-100 px-1 rounded">https://hooks.slack.com/services/...</code>)</li>
                </ol>
              </div>

              {/* Discord Instructions */}
              <div>
                <h3 className="font-semibold text-navy-900 flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 bg-[#5865F2] rounded flex items-center justify-center text-white text-xs font-bold">D</span>
                  Discord Webhook
                </h3>
                <ol className="text-sm text-navy-600 space-y-2 list-decimal list-inside">
                  <li>Open Discord and go to your server</li>
                  <li>Right-click the channel → <strong>Edit Channel</strong></li>
                  <li>Go to <strong>Integrations</strong> → <strong>Webhooks</strong></li>
                  <li>Click <strong>New Webhook</strong></li>
                  <li>Name it (e.g., &quot;ShipLog Releases&quot;)</li>
                  <li>Click <strong>Copy Webhook URL</strong></li>
                  <li>The URL looks like <code className="bg-navy-100 px-1 rounded">https://discord.com/api/webhooks/...</code></li>
                </ol>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <p className="text-sm text-teal-800">
                  <strong>Tip:</strong> Create separate channels for different audiences. For example, #releases-public for customers and #releases-dev for your team.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-navy-100 bg-navy-50">
              <button
                onClick={() => setShowWebhookHelp(false)}
                className="w-full px-4 py-2 bg-navy-900 text-white rounded-lg font-medium hover:bg-navy-800 transition"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div 
            className="bg-white rounded-xl max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-navy-900 text-center mb-2">Delete Channel</h2>
              <p className="text-navy-600 text-center">
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="p-4 border-t border-navy-100 flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-navy-200 text-navy-600 rounded-lg font-medium hover:bg-navy-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteChannel(deleteConfirm.channelId)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
