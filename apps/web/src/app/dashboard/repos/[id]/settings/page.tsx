'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { ArrowLeft, Save, Loader2, AlertCircle, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getRepo, getUser, isAuthenticated, updateRepoConfig, type RepoDetail, type User } from '../../../../../lib/api';

export default function RepoSettingsPage() {
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [config, setConfig] = useState({
    autoGenerate: true,
    autoPublish: false,
    excludeFromFeatured: false,
    publicTitle: '',
    publicDescription: '',
    customerTone: 'friendly',
  });

  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;

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
          getRepo(repoId),
          getUser()
        ]);
        setRepo(repoData);
        setUser(userData);
        
        // Initialize form
        setConfig({
          autoGenerate: repoData.config?.autoGenerate ?? true,
          autoPublish: repoData.config?.autoPublish ?? false,
          excludeFromFeatured: (repoData as any).excludeFromFeatured ?? false, // Cast for now until types sync
          publicTitle: (repoData as any).publicTitle ?? '',
          publicDescription: (repoData as any).publicDescription ?? '',
          customerTone: repoData.config?.customerTone ?? 'friendly',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [repoId, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await updateRepoConfig(repoId, {
        autoGenerate: config.autoGenerate,
        autoPublish: config.autoPublish,
        customerTone: config.customerTone,
        // @ts-ignore - API needs to support these new fields on root/config
        excludeFromFeatured: config.excludeFromFeatured,
        publicTitle: config.publicTitle,
        publicDescription: config.publicDescription,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout user={user}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout user={user}>
      <div className="max-w-2xl mx-auto">
        <Link 
          href={`/dashboard/repos/${repoId}`}
          className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Repository
        </Link>

        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-6">
          <h1 className="text-2xl font-bold text-navy-900 mb-6">Settings: {repo?.fullName}</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <Check className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
              <p className="text-teal-700 text-sm">Settings saved successfully.</p>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-8">
            {/* Automation */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-900 border-b border-navy-100 pb-2">Automation</h2>
              
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="autoGenerate"
                  checked={config.autoGenerate}
                  onChange={(e) => setConfig({ ...config, autoGenerate: e.target.checked })}
                  className="mt-1 rounded border-navy-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <label htmlFor="autoGenerate" className="block text-sm font-medium text-navy-900">
                    Auto-generate changelogs
                  </label>
                  <p className="text-sm text-navy-500">
                    Automatically draft release notes when a new GitHub release is detected.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="autoPublish"
                  checked={config.autoPublish}
                  onChange={(e) => setConfig({ ...config, autoPublish: e.target.checked })}
                  className="mt-1 rounded border-navy-300 text-teal-600 focus:ring-teal-500"
                />
                <div>
                  <label htmlFor="autoPublish" className="block text-sm font-medium text-navy-900">
                    Auto-publish to channels (Global)
                  </label>
                  <p className="text-sm text-navy-500">
                    If enabled, releases will be sent to "Auto-Publish" channels immediately. 
                    Disable this to review drafts first.
                  </p>
                </div>
              </div>
            </div>

            {/* Public Page */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-900 border-b border-navy-100 pb-2">Hosted Page</h2>
              
              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1">
                    Public Title
                  </label>
                  <input
                    type="text"
                    value={config.publicTitle}
                    onChange={(e) => setConfig({ ...config, publicTitle: e.target.value })}
                    placeholder="e.g. Acme Changelog"
                    className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-1">
                    Public Description
                  </label>
                  <textarea
                    value={config.publicDescription}
                    onChange={(e) => setConfig({ ...config, publicDescription: e.target.value })}
                    placeholder="What is this project about?"
                    rows={3}
                    className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition resize-none"
                  />
                </div>

                <div className="flex items-start gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="excludeFromFeatured"
                    checked={config.excludeFromFeatured}
                    onChange={(e) => setConfig({ ...config, excludeFromFeatured: e.target.checked })}
                    className="mt-1 rounded border-navy-300 text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <label htmlFor="excludeFromFeatured" className="block text-sm font-medium text-navy-900">
                      Hide from Index / Featured
                    </label>
                    <p className="text-sm text-navy-500">
                      Prevent this changelog from appearing in public directories or search results.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Personality */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-navy-900 border-b border-navy-100 pb-2">AI Personality</h2>
              
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">
                  Customer Tone
                </label>
                <select
                  value={config.customerTone}
                  onChange={(e) => setConfig({ ...config, customerTone: e.target.value })}
                  className="w-full rounded-lg border border-navy-200 px-3 py-2 text-sm focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition"
                >
                  <option value="friendly">Friendly & Enthusiastic (Default)</option>
                  <option value="professional">Professional & Corporate</option>
                  <option value="technical">Technical & Direct</option>
                  <option value="pirate">Pirate Captain 🏴‍☠️</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-navy-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition font-medium flex items-center gap-2 disabled:opacity-70"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
