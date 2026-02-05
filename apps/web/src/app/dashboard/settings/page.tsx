'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, User, Palette, Key, Building, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearToken, createCheckoutSession, createPortalSession, getUser, isAuthenticated, type User as UserType } from '../../../lib/api';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load user');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = () => {
    clearToken();
    router.push('/login');
  };

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
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition"
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
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          {user && (
            <div className="flex items-center gap-3 px-4 py-3 bg-navy-800 rounded-lg">
              <img 
                src={user.avatarUrl || 'https://github.com/github.png'}
                alt={user.name || user.login}
                className="w-8 h-8 rounded-full"
              />
              <span className="font-medium flex-1 truncate">{user.name || user.login}</span>
              <button
                onClick={handleLogout}
                className="text-navy-400 hover:text-white transition"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8">
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

              {/* Profile Section */}
              <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
                <div className="flex items-center gap-3 mb-4">
                  <User className="w-5 h-5 text-navy-600" />
                  <h2 className="text-lg font-semibold text-navy-900">Profile</h2>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <img 
                    src={user.avatarUrl || 'https://github.com/github.png'}
                    alt={user.name || user.login}
                    className="w-16 h-16 rounded-full"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-navy-900">{user.name || user.login}</p>
                    <p className="text-sm text-navy-500">{user.email ?? 'No email on file'}</p>
                  </div>
                  <button className="px-4 py-2 text-sm text-navy-600 border border-navy-200 rounded-lg hover:bg-navy-50 transition w-full sm:w-auto">
                    Edit Profile
                  </button>
                </div>
              </div>

            {/* Organization Section */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Building className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Organization</h2>
              </div>
              <p className="text-navy-600 mb-4">Create an organization to collaborate with your team.</p>
              <button className="px-4 py-2 text-sm bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition w-full sm:w-auto">
                Create Organization
              </button>
            </div>

            {/* Appearance Section */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Palette className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Appearance</h2>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-navy-900">Theme</p>
                  <p className="text-sm text-navy-500">Choose your preferred color scheme</p>
                </div>
                <select className="px-4 py-2 border border-navy-200 rounded-lg text-navy-900 bg-white w-full sm:w-auto">
                  <option>System</option>
                  <option>Light</option>
                  <option>Dark</option>
                </select>
              </div>
            </div>

            {/* API Keys Section */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">API Keys</h2>
              </div>
              <p className="text-navy-600 mb-4">Generate API keys to integrate ShipLog with your CI/CD pipeline.</p>
              <button className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition w-full sm:w-auto">
                Generate API Key
              </button>
            </div>

            {/* Danger Zone */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-red-200">
              <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-navy-900">Delete Account</p>
                  <p className="text-sm text-navy-500">Permanently delete your account and all data</p>
                </div>
                <button className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition w-full sm:w-auto">
                  Delete Account
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </main>
    </div>
  );
}
