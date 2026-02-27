'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/Dialog';
import { AlertCircle, ArrowLeft, Check, Code, Copy, Edit3, ExternalLink, Eye, Loader2, RefreshCw, Send, Tag, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import MDEditor from '@uiw/react-md-editor';
import { getRelease, getUser, isAuthenticated, publishRelease, regenerateNotes, updateReleaseNotes, type Release, type User } from '../../../../lib/api';

type Tab = 'customer' | 'developer' | 'stakeholder';

export default function ReleaseDetailPage() {
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
  const [user, setUser] = useState<User | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

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
        const [data, userData] = await Promise.all([
          getRelease(releaseId),
          getUser()
        ]);
        setRelease(data);
        setUser(userData);
        // Pre-select enabled channels
        if (data.repo?.config?.channels) {
          setSelectedChannels(
            data.repo.config.channels
              .filter(c => c.enabled)
              .map(c => c.id)
          );
        }
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
      await publishRelease(releaseId, selectedChannels);
      const data = await getRelease(releaseId);
      setRelease(data);
      setShowPublishDialog(false);
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
  };

  const handleSave = async () => {
    if (!release) return;
    try {
      setSaving(true);
      await updateReleaseNotes(releaseId, { [activeTab]: editContent });
      const data = await getRelease(releaseId);
      setRelease(data);
      setEditing(false);
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

  const tabConfig = {
    customer: { label: 'Customer', description: 'Benefit-focused, jargon-free' },
    developer: { label: 'Developer', description: 'Technical details & breaking changes' },
    stakeholder: { label: 'Stakeholder', description: 'Executive summary & metrics' },
  };

  return (
    <DashboardLayout user={user}>
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
                  {release.notes && (
                    <button
                      onClick={() => setShowPublishDialog(true)}
                      className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      {release.status === 'PUBLISHED' ? 'Republish' : 'Publish'}
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
                      onClick={() => { setActiveTab(tab); setEditing(false); }}
                      className={`px-6 py-4 text-sm font-medium transition flex-shrink-0 ${activeTab === tab
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
                    <div /> {/* Spacer */}

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
                      <div className="mb-4 border border-navy-200 rounded-lg overflow-hidden" data-color-mode="light">
                        <MDEditor
                          value={editContent}
                          onChange={(val) => setEditContent(val || '')}
                          preview="edit"
                          height={400}
                          visibleDragbar={false}
                          hideToolbar={false}
                          enableScroll={true}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setEditing(false); }}
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
                  ) : (
                    <div className="prose prose-navy max-w-none prose-headings:text-navy-900 prose-p:text-navy-700 prose-li:text-navy-700 prose-strong:text-navy-900 prose-code:bg-navy-100 prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none">
                      <ReactMarkdown>
                        {release.notes[activeTab]}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Metadata - only show edited status */}
                  {release.notes[`${activeTab}Edited` as keyof typeof release.notes] && (
                    <div className="mt-6 pt-4 border-t border-navy-100 text-sm text-amber-600">
                      Manually edited
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

        {/* Publish Dialog */}
        <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish Release Notes</DialogTitle>
              <DialogDescription>
                Choose where you want to send this update.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {release?.repo.config?.channels && release.repo.config.channels.length > 0 ? (
                <div className="space-y-2">
                  {release.repo.config.channels.map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 p-3 rounded-lg border border-navy-100 bg-navy-50/50">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(channel.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedChannels([...selectedChannels, channel.id]);
                          } else {
                            setSelectedChannels(selectedChannels.filter(id => id !== channel.id));
                          }
                        }}
                        className="rounded border-navy-300 text-teal-600 focus:ring-teal-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {channel.type === 'SLACK' ? (
                            <MessageSquare className="w-4 h-4 text-[#4A154B]" />
                          ) : (
                            <MessageSquare className="w-4 h-4 text-[#5865F2]" />
                          )}
                          <span className="font-medium text-navy-900">{channel.name}</span>
                        </div>
                        <p className="text-xs text-navy-500 capitalize">{channel.audience} Audience</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-navy-50 rounded-lg">
                  <p className="text-navy-600 mb-2">No channels configured.</p>
                  <Link href={`/dashboard/repos/${release?.repo.id}`} className="text-teal-600 hover:underline text-sm">
                    Add a channel in settings
                  </Link>
                </div>
              )}
            </div>
            <DialogFooter>
              <button
                onClick={() => setShowPublishDialog(false)}
                className="px-4 py-2 text-sm text-navy-600 hover:text-navy-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || selectedChannels.length === 0}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition disabled:opacity-50 flex items-center gap-2"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send to {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
