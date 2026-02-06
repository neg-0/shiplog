'use client';

import { Ship, Settings, GitBranch, Bell, Menu, X, ArrowLeft, Building2, Users, Plus, Loader2, AlertCircle, Crown, Shield, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser, type User } from '../../../lib/api';

// Placeholder types until API is ready
interface Organization {
  id: string;
  name: string;
  slug: string;
  githubOrgLogin: string | null;
  memberCount: number;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export default function OrganizationsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  const router = useRouter();

  const isPro = user?.subscriptionTier === 'TEAM';

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const userData = await getUser();
        setUser(userData);
        // TODO: Fetch organizations when API is ready
        // const orgs = await getOrganizations();
        // setOrganizations(orgs);
        setOrganizations([]); // Empty for now
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER': return <Crown className="w-4 h-4 text-amber-500" />;
      case 'ADMIN': return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <UserIcon className="w-4 h-4 text-navy-400" />;
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
            href="/dashboard/organizations" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <Building2 className="w-5 h-5" />
            Organizations
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
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-navy-900">Organizations</h1>
              <p className="text-navy-600 mt-1">Manage your team workspaces</p>
            </div>
            {isPro ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Organization
              </button>
            ) : (
              <Link
                href="/dashboard/settings"
                className="px-4 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                Upgrade to Team
              </Link>
            )}
          </div>

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

          {/* Organizations List */}
          {!loading && !error && (
            <>
              {organizations.length === 0 ? (
                <div className="bg-white rounded-xl p-12 shadow-sm border border-navy-100 text-center">
                  <Building2 className="w-16 h-16 text-navy-200 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-navy-900 mb-2">No organizations yet</h3>
                  <p className="text-navy-600 mb-6 max-w-md mx-auto">
                    {isPro 
                      ? "Create an organization to collaborate with your team on release notes."
                      : "Upgrade to the Team plan to create organizations and collaborate with your team."
                    }
                  </p>
                  {isPro ? (
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-5 h-5" />
                      Create Your First Organization
                    </button>
                  ) : (
                    <Link
                      href="/dashboard/settings"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition"
                    >
                      <Building2 className="w-5 h-5" />
                      Upgrade to Team — $79/mo
                    </Link>
                  )}
                </div>
              ) : (
                <div className="grid gap-4">
                  {organizations.map((org) => (
                    <Link
                      key={org.id}
                      href={`/dashboard/organizations/${org.id}`}
                      className="bg-white rounded-xl p-6 shadow-sm border border-navy-100 hover:border-teal-300 hover:shadow-md transition block"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-navy-100 rounded-xl flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-navy-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-navy-900">{org.name}</h3>
                            <p className="text-sm text-navy-500">
                              {org.githubOrgLogin && `@${org.githubOrgLogin} · `}
                              {org.memberCount} member{org.memberCount !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(org.role)}
                          <span className="text-sm text-navy-600 capitalize">{org.role.toLowerCase()}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Create Organization Modal */}
      {showCreateModal && (
        <CreateOrganizationModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function CreateOrganizationModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [githubOrg, setGithubOrg] = useState('');
  const [creating, setCreating] = useState(false);
  const [githubOrgs, setGithubOrgs] = useState<{ id: number; login: string }[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  useEffect(() => {
    // TODO: Fetch user's GitHub organizations
    // const orgs = await getGitHubOrgs();
    // setGithubOrgs(orgs);
    setLoadingOrgs(false);
    // Mock data for now
    setGithubOrgs([]);
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    setCreating(true);
    try {
      // TODO: Call API to create organization
      // await createOrganization({ name, githubOrgLogin: githubOrg || undefined });
      console.log('Creating org:', { name, githubOrg });
      onClose();
      // Refresh page or navigate to new org
    } catch (err) {
      console.error('Failed to create organization:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-navy-100">
          <h2 className="text-xl font-bold text-navy-900">Create Organization</h2>
          <p className="text-navy-600 text-sm mt-1">
            Set up a team workspace for collaborative release notes
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Organization Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc"
              className="w-full px-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Link GitHub Organization
              <span className="text-navy-400 font-normal ml-1">(optional)</span>
            </label>
            {loadingOrgs ? (
              <div className="flex items-center gap-2 text-navy-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading GitHub organizations...
              </div>
            ) : githubOrgs.length === 0 ? (
              <div className="bg-navy-50 rounded-lg p-4 text-sm text-navy-600">
                <p className="mb-2">No GitHub organizations found.</p>
                <p className="text-navy-500">
                  You can link a GitHub organization later to restrict which repos can be added.
                </p>
              </div>
            ) : (
              <select
                value={githubOrg}
                onChange={(e) => setGithubOrg(e.target.value)}
                className="w-full px-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">Don&apos;t link (allow any repo)</option>
                {githubOrgs.map((org) => (
                  <option key={org.id} value={org.login}>
                    @{org.login}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
            <p className="text-sm text-teal-800">
              <strong>Team Plan:</strong> Unlimited seats included. Invite your entire team at no extra cost.
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-navy-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-navy-200 text-navy-600 rounded-lg font-medium hover:bg-navy-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create Organization
          </button>
        </div>
      </div>
    </div>
  );
}
