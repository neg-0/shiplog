'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, ArrowLeft, ExternalLink, Tag, Loader2, AlertCircle, RefreshCw, Send, Edit3, Check, Copy, Eye, Code } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRelease, regenerateNotes, publishRelease, updateReleaseNotes, isAuthenticated, type Release } from '../../../../lib/api';

type Tab = 'customer' | 'developer' | 'stakeholder';

export default function ReleaseDetailPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('customer');
  const [regenerating, setRegenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');
  
  const params = useParams();
  const router = useRouter();
  const releaseId = params.id as string;

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchRelease = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRelease(releaseId);
        setRelease(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load release');
      } finally {
        setLoading(false);
      }
    };

    fetchRelease();
  }, [releaseId, router]);

  const handleRegenerate = async () => {
    if (!release) return;
    try {
      setRegenerating(true);
      // TODO: Update API to support per-audience regeneration
      await regenerateNotes(releaseId);
      const data = await getRelease(releaseId);
      setRelease(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate notes');
    } finally {
      setRegenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!release) return;
    try {
      setPublishing(true);
      await publishRelease(releaseId);
      const data = await getRelease(releaseId);
      setRelease(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish release');
    } finally {
      setPublishing(false);
    }
  };

  const handleEdit = () => {
    if (!release?.notes) return;
    setEditContent(release.notes[activeTab]);
    setEditing(true);
    setViewMode('raw');
  };

  const handleSave = async () => {
    if (!release) return;
    try {
      setSaving(true);
      await updateReleaseNotes(releaseId, { [activeTab]: editContent });
      const data = await getRelease(releaseId);
      setRelease(data);
      setEditing(false);
      setViewMode('rendered');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!release?.notes) return;
    navigator.clipboard.writeText(release.notes[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED': return 'bg-teal-100 text-teal-700';
      case 'READY': return 'bg-blue-100 text-blue-700';
      case 'PROCESSING': return 'bg-amber-100 text-amber-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const renderMarkdown = (content: string) => {
    return content
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-navy-900 mt-6 mb-3 first:mt-0">$1</h1>')
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-navy-900 mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-navy-900 mt-6 mb-3">$2</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="bg-navy-100 px-1 rounded text-sm">$1</code>')
      .replace(/^- (.+)$/gm, '<li class="text-navy-700 ml-4">$1</li>')
      .replace(/\n\n/g, '<br/><br/>');
  };

  const tabConfig = {
    customer: { label: 'Customer', description: 'Benefit-focused, jargon-free' },
    developer: { label: 'Developer', description: 'Technical details & breaking changes' },
    stakeholder: { label: 'Stakeholder', description: 'Executive summary & metrics' },
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
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          {release && (
            <Link 
              href={`/dashboard/repos/${release.repo.id}`}
              className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to {release.repo.fullName}
            </Link>
          )}

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

          {/* Release Content */}
          {release && !loading && (
            <>
              {/* Release Header */}
              <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Tag className="w-6 h-6 text-navy-600" />
                      <h1 className="text-2xl font-bold text-navy-900">{release.tagName}</h1>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(release.status)}`}>
                        {release.status}
                      </span>
                    </div>
                    {release.name && (
                      <p className="text-navy-600">{release.name}</p>
                    )}
                    <p className="text-sm text-navy-500 mt-1">
                      {release.repo.fullName}
                      {release.publishedAt && (
                        <> · Published {new Date(release.publishedAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a 
                      href={release.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-sm text-navy-600 border border-navy-200 rounded-lg hover:bg-navy-50 transition flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      GitHub
                    </a>
                    {release.notes && release.status !== 'PUBLISHED' && (
                      <button
                        onClick={handlePublish}
                        disabled={publishing}
                        className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2 disabled:opacity-50"
                      >
                        {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Publish
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              {release.notes ? (
                <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
                  {/* Tabs */}
                  <div className="border-b border-navy-100 flex overflow-x-auto">
                    {(Object.keys(tabConfig) as Tab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => { setActiveTab(tab); setEditing(false); setViewMode('rendered'); }}
                        className={`px-6 py-4 text-sm font-medium transition flex-shrink-0 ${
                          activeTab === tab
                            ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50/50'
                            : 'text-navy-600 hover:text-navy-900 hover:bg-navy-50'
                        }`}
                      >
                        <span className="block">{tabConfig[tab].label}</span>
                        <span className="block text-xs font-normal text-navy-400 mt-0.5">
                          {tabConfig[tab].description}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    {/* Action Bar */}
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-navy-100">
                      {/* View Toggle (when not editing) */}
                      {!editing && (
                        <div className="flex items-center gap-1 bg-navy-100 rounded-lg p-1">
                          <button
                            onClick={() => setViewMode('rendered')}
                            className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1.5 ${
                              viewMode === 'rendered' 
                                ? 'bg-white text-navy-900 shadow-sm' 
                                : 'text-navy-600 hover:text-navy-900'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                          </button>
                          <button
                            onClick={() => setViewMode('raw')}
                            className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1.5 ${
                              viewMode === 'raw' 
                                ? 'bg-white text-navy-900 shadow-sm' 
                                : 'text-navy-600 hover:text-navy-900'
                            }`}
                          >
                            <Code className="w-3.5 h-3.5" />
                            Markdown
                          </button>
                        </div>
                      )}
                      {editing && <div />}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCopy}
                          className="px-3 py-1.5 text-sm text-navy-600 hover:text-navy-900 hover:bg-navy-50 rounded-md transition flex items-center gap-1.5"
                        >
                          {copied ? <Check className="w-4 h-4 text-teal-600" /> : <Copy className="w-4 h-4" />}
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                        {!editing && (
                          <>
                            <button
                              onClick={handleEdit}
                              className="px-3 py-1.5 text-sm text-navy-600 hover:text-navy-900 hover:bg-navy-50 rounded-md transition flex items-center gap-1.5"
                            >
                              <Edit3 className="w-4 h-4" />
                              Edit
                            </button>
                            <button
                              onClick={handleRegenerate}
                              disabled={regenerating}
                              className="px-3 py-1.5 text-sm text-navy-600 hover:text-navy-900 hover:bg-navy-50 rounded-md transition flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                              Regenerate
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {editing ? (
                      <div>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-96 p-4 border border-navy-200 rounded-lg font-mono text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                          placeholder="Enter markdown content..."
                        />
                        <div className="flex justify-end gap-2 mt-4">
                          <button
                            onClick={() => { setEditing(false); setViewMode('rendered'); }}
                            className="px-4 py-2 text-sm text-navy-600 hover:text-navy-900 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition disabled:opacity-50 flex items-center gap-2"
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Save Changes
                          </button>
                        </div>
                      </div>
                    ) : viewMode === 'raw' ? (
                      <pre className="w-full p-4 bg-navy-50 border border-navy-200 rounded-lg font-mono text-sm text-navy-900 overflow-x-auto whitespace-pre-wrap">
                        {release.notes[activeTab]}
                      </pre>
                    ) : (
                      <div 
                        className="prose prose-navy max-w-none"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(release.notes[activeTab]) }}
                      />
                    )}

                    {/* Metadata */}
                    {release.notes.tokensUsed && (
                      <div className="mt-6 pt-4 border-t border-navy-100 text-sm text-navy-400">
                        Generated with {release.notes.model} · {release.notes.tokensUsed} tokens used
                        {release.notes[`${activeTab}Edited` as keyof typeof release.notes] && (
                          <span className="ml-2 text-amber-600">· Manually edited</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-navy-100 text-center">
                  <AlertCircle className="w-12 h-12 text-navy-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-navy-900 mb-2">No notes generated yet</h3>
                  <p className="text-navy-600 mb-4">
                    {release.status === 'PROCESSING' 
                      ? 'Notes are being generated...'
                      : 'Click regenerate to generate release notes for this release.'}
                  </p>
                  {release.status !== 'PROCESSING' && (
                    <button
                      onClick={handleRegenerate}
                      disabled={regenerating}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2 mx-auto disabled:opacity-50"
                    >
                      {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Generate Notes
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
