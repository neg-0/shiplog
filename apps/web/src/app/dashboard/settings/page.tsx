'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { AlertDialog } from '@/components/Dialog';
import { AlertTriangle, CreditCard, Key, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearToken, createCheckoutSession, createPortalSession, deleteUser, getUser, isAuthenticated, updateUser, type User } from '../../../lib/api';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [alertDialog, setAlertDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'success' | 'error' | 'info' }>({
    isOpen: false, title: '', message: '', variant: 'info'
  });

  // Edit Profile State
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchUser = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getUser();
        setUser(data);
        setDisplayName(data.name || data.login || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);



  const handleUpgrade = async (plan: 'pro' | 'team') => {
    const session = await createCheckoutSession(plan);
    if (session.url) {
      window.location.href = session.url;
    }
  };

  const handleManage = async () => {
    const session = await createPortalSession();
    if (session.url) {
      window.location.href = session.url;
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await updateUser({ name: displayName });
      // Refresh user data
      const updated = await getUser();
      setUser(updated);
      setAlertDialog({ isOpen: true, title: 'Success', message: 'Profile updated successfully', variant: 'success' });
    } catch (err) {
      setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to update profile', variant: 'error' });
      console.error(err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') return;

    setIsDeleting(true);
    try {
      await deleteUser();
      clearToken();
      router.push('/');
    } catch (err) {
      setAlertDialog({ isOpen: true, title: 'Error', message: 'Failed to delete account', variant: 'error' });
      console.error(err);
      setIsDeleting(false);
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-900">Settings</h1>
          <p className="text-navy-600">Manage your account and preferences</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && user && (
          <div className="space-y-6">
            {/* Plan Section */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <CreditCard className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Plan</h2>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-navy-900">Current plan: {user.subscriptionTier}</p>
                  <p className="text-sm text-navy-500">
                    {user.subscriptionStatus ? `Status: ${user.subscriptionStatus}` : 'No active subscription'}
                    {user.subscriptionStatus === 'trialing' && user.trialEndsAt && (
                      <span className="ml-2">Trial until {new Date(user.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  {user.subscriptionTier !== 'TEAM' && (
                    <button
                      onClick={() => handleUpgrade(user.subscriptionTier === 'PRO' ? 'team' : 'pro')}
                      className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition"
                    >
                      Upgrade
                    </button>
                  )}
                  <button
                    onClick={handleManage}
                    className="px-4 py-2 text-sm text-navy-600 border border-navy-200 rounded-lg hover:bg-navy-50 transition"
                  >
                    Manage Subscription
                  </button>
                </div>
              </div>
            </div>

            {/* Edit Profile Section */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-6">
                <UserIcon className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Edit Profile</h2>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <img
                    src={user.avatarUrl || 'https://github.com/github.png'}
                    alt={user.name || user.login}
                    className="w-16 h-16 rounded-full border border-navy-100"
                  />
                  <div>
                    <p className="text-sm font-medium text-navy-900">Profile Picture</p>
                    <p className="text-xs text-navy-500">Managed via GitHub</p>
                  </div>
                </div>

                <div className="grid gap-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-navy-700 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-navy-200 rounded-lg focus:outline-none focus:border-teal-500"
                      placeholder="Your Name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-navy-700 mb-1">Email</label>
                    <input
                      type="text"
                      value={user.email || ''}
                      readOnly
                      className="w-full px-3 py-2 bg-navy-50 border border-navy-200 rounded-lg text-navy-500 cursor-not-allowed"
                    />
                    <p className="text-xs text-navy-400 mt-1">Managed via GitHub</p>
                  </div>
                </div>

                <div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="px-4 py-2 text-sm bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>

            {/* API Keys Section */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">API Keys</h2>
              </div>
              <p className="text-navy-600 mb-4">Generate API keys to integrate ShipLog with your CI/CD pipeline.</p>
              <button
                disabled
                className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg opacity-50 cursor-not-allowed transition w-full sm:w-auto"
              >
                Generate API Key
              </button>
              <p className="text-sm text-navy-500 mt-2">Coming soon</p>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-red-200">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-navy-900">Delete Account</p>
                  <p className="text-sm text-navy-500">Permanently delete your account and all data</p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition w-full sm:w-auto"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
        title={alertDialog.title}
        message={alertDialog.message}
        variant={alertDialog.variant as 'info' | 'success' | 'error'}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-xl font-bold text-navy-900 mb-2">Delete Account?</h3>
            <p className="text-navy-600 mb-6">
              This action cannot be undone. This will permanently delete your account, repositories, and all release history.
            </p>

            <label className="block text-sm font-medium text-navy-700 mb-2">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="w-full px-3 py-2 border border-navy-200 rounded-lg focus:outline-none focus:border-red-500 mb-6"
              placeholder="DELETE"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
                className="px-4 py-2 text-sm text-navy-600 hover:bg-navy-50 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== 'DELETE' || isDeleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
