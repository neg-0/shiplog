'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ConfirmDialog } from '@/components/Dialog';
import { AlertCircle, ArrowLeft, Check, Code, Copy, Edit3, ExternalLink, Eye, Loader2, RefreshCw, Send, Tag, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import dynamic from 'next/dynamic';
import { getRelease, getUser, isAuthenticated, publishRelease, regenerateNotes, updateReleaseNotes, type Release, type User } from '../../../../lib/api';

type Tab = 'customer' | 'developer' | 'stakeholder';
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

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
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);

  const params = useParams();
  const router = useRouter();
  const releaseId = params.id as string;
  const deliveryNeedsReview = release?.error?.startsWith('Delivery outcome needs review.') ?? false;
  const canNotifyChannels = release?.repo.entitlements?.channels ?? false;

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
        if (data.repo?.entitlements?.channels && data.repo.config?.channels) {
          setSelectedChannels(
            data.repo.config.channels
              .filter(c => c.enabled && c.type !== 'WEBHOOK')
              .map(c => c.id)
          );
        } else setSelectedChannels([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load release');
      } finally {
        setLoading(false);
      }
    };

    fetchRelease();
  }, [releaseId, router]);

  useEffect(() => {
    if (release?.status !== 'PROCESSING') return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const data = await getRelease(releaseId);
        if (active) setRelease(data);
      } catch {
        // Keep the last known state; the next poll can recover from a brief outage.
      }
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [release?.status, releaseId]);

  const handleRegenerate = async () => {
    if (!release) return;
    try {
      setRegenerating(true);
      setError(null);
      setShowRegenerateDialog(false);
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
      setError(null);
      setPublishMessage(null);
      const result = await publishRelease(releaseId, canNotifyChannels ? selectedChannels : []);
      const data = await getRelease(releaseId);
      setRelease(data);
      setShowPublishDialog(false);
      const message = result.status === 'partial_success'
        ? `The release was published, but ${result.failedCount || 1} delivery failed. Choose Retry delivery to try the failed channels again.`
        : 'Release notes published successfully.';
      setPublishMessage(data.repo.isPublic ? message : `${message} Your hosted changelog remains private. Enable public access in repository settings when you are ready to share.`);
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
      setError(null);
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

  const handleCopy = async () => {
    if (!release?.notes) return;
    try {
      await navigator.clipboard.writeText(editing ? editContent : release.notes[activeTab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the notes. Please select the text and copy it manually.');
    }
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
        {release ? (
          <Link
            href={`/dashboard/repos/${release.repo.id}`}
            className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {release.repo.fullName}
          </Link>
        ) : (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
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
            {deliveryNeedsReview && <p role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">Delivery outcome needs review. Please contact support before retrying or regenerating this release.</p>}
            {publishMessage && <p role="status" className="mb-6 rounded-lg bg-navy-100 p-4 text-navy-800">{publishMessage}</p>}
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
                      disabled={editing || regenerating || saving || publishing || deliveryNeedsReview}
                      className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {release.status === 'PUBLISHED' ? 'Retry delivery' : 'Publish'}
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
                      onClick={() => { setActiveTab(tab); setCopied(false); }}
                      disabled={editing || saving || regenerating}
                      className={`px-6 py-4 text-sm font-medium transition flex-shrink-0 disabled:cursor-not-allowed ${activeTab === tab
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
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
                            disabled={regenerating || publishing || deliveryNeedsReview}
                            className="px-3 py-1.5 text-sm text-navy-600 hover:text-navy-900 hover:bg-navy-50 rounded-md transition flex items-center gap-1.5"
                          >
                            <Edit3 className="w-4 h-4" />
                            Edit
                          </button>
                          <button
                            onClick={() => setShowRegenerateDialog(true)}
                            disabled={regenerating || publishing || deliveryNeedsReview}
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
                      <p className="mb-3 text-sm text-navy-600">Save or cancel your changes before switching audiences or publishing.</p>
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
                          disabled={saving}
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
                <p className="mb-4 text-sm text-navy-500">Generating notes sends release text, commits, and pull request descriptions to OpenAI.</p>
                {release.status !== 'PROCESSING' && (
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating || deliveryNeedsReview}
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
        <Dialog open={showPublishDialog} onOpenChange={(open) => { if (!publishing) setShowPublishDialog(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Publish Release Notes</DialogTitle>
              <DialogDescription>
                Publish this update and choose any channels to notify. Previously successful deliveries will not be sent again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-4">
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              {!release?.repo.isPublic && <p className="text-sm text-navy-700">Your hosted changelog is private. Publishing does not make it public. <Link href={`/dashboard/repos/${release?.repo.id}/settings`} className="text-teal-700 underline">Enable public access in repository settings</Link> when you are ready to share. Selected channels will still receive notifications.</p>}
              {!canNotifyChannels ? (
                <p className="text-sm text-navy-600">Slack and Discord delivery requires Pro. <Link href="/dashboard/settings" className="text-teal-700 underline">Upgrade your plan</Link>. You can publish hosted release notes on Free.</p>
              ) : release?.repo.config?.channels?.some(channel => channel.enabled) ? (
                <div className="space-y-2">
                  {release.repo.config.channels.filter(channel => channel.enabled).map((channel) => (
                    <div key={channel.id} className="flex items-center gap-3 p-3 rounded-lg border border-navy-100 bg-navy-50/50">
                      <input
                        type="checkbox"
                        aria-label={`Notify ${channel.name}`}
                        disabled={publishing || channel.type === 'WEBHOOK'}
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
                        {channel.type === 'WEBHOOK' && <p className="text-xs text-amber-700">Generic webhooks are unavailable. Add a Slack or Discord channel instead.</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-navy-50 rounded-lg">
                  <p className="text-navy-600 mb-2">No enabled channels. You can still publish to your hosted changelog.</p>
                  <Link href={`/dashboard/repos/${release?.repo.id}`} className="text-teal-600 hover:underline text-sm">
                    Add a channel in settings
                  </Link>
                </div>
              )}
            </div>
            <DialogFooter>
              <button
                onClick={() => setShowPublishDialog(false)}
                disabled={publishing}
                className="px-4 py-2 text-sm text-navy-600 hover:text-navy-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition disabled:opacity-50 flex items-center gap-2"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {!canNotifyChannels || selectedChannels.length === 0 ? (release?.repo.isPublic ? 'Publish to changelog' : 'Publish notes privately') : `Publish and notify ${selectedChannels.length} channel${selectedChannels.length !== 1 ? 's' : ''}`}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ConfirmDialog
          isOpen={showRegenerateDialog}
          onClose={() => setShowRegenerateDialog(false)}
          onConfirm={handleRegenerate}
          title="Regenerate all release notes?"
          message="This replaces the notes for every audience, including manual edits. Release text, commits, and pull request descriptions are sent to OpenAI."
          confirmText="Regenerate all notes"
        />
      </div>
    </DashboardLayout>
  );
}
