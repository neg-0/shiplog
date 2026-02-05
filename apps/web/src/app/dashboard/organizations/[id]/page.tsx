'use client';

import { Ship, Settings, GitBranch, Bell, Menu, X, ArrowLeft, Building2, Users, Plus, Loader2, AlertCircle, Crown, Shield, User, Mail, Trash2, MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { isAuthenticated } from '../../../../../lib/api';

// Placeholder types
interface OrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  githubOrgId: number | null;
  githubOrgLogin: string | null;
  members: OrganizationMember[];
  repoCount: number;
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export default function OrganizationDetailPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members');
  
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchOrg = async () => {
      try {
        setLoading(true);
        // TODO: Fetch organization when API is ready
        // const data = await getOrganization(orgId);
        // setOrg(data);
        
        // Mock data for now
        setOrg({
          id: orgId,
          name: 'Acme Inc',
          slug: 'acme-inc',
          githubOrgId: 12345,
          githubOrgLogin: 'acme-corp',
          members: [
            {
              id: '1',
              userId: 'u1',
              name: 'John Doe',
              email: 'john@acme.com',
              avatarUrl: null,
              role: 'OWNER',
              joinedAt: new Date().toISOString(),
            },
          ],
          repoCount: 5,
          myRole: 'OWNER',
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organization');
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [orgId, router]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER': return <Crown className="w-4 h-4 text-amber-500" />;
      case 'ADMIN': return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <User className="w-4 h-4 text-navy-400" />;
    }
  };

  const canManageMembers = org?.myRole === 'OWNER' || org?.myRole === 'ADMIN';

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
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition">
            <GitBranch className="w-5 h-5" />
            Repositories
          </Link>
          <Link href="/dashboard/organizations" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white">
            <Building2 className="w-5 h-5" />
            Organizations
          </Link>
          <Link href="/dashboard/activity" className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition">
            <Bell className="w-5 h-5" />
            Activity
          </Link>
          <Link href="/dashboard/settings" className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition">
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Link */}
          <Link 
            href="/dashboard/organizations"
            className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Organizations
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

          {/* Organization Content */}
          {org && !loading && (
            <>
              {/* Header */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-navy-100 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-navy-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-8 h-8 text-navy-600" />
                    </div>
                    <div>
                      <h1 className="text-2xl font-bold text-navy-900">{org.name}</h1>
                      <p className="text-navy-600">
                        {org.githubOrgLogin && (
                          <span className="text-navy-500">@{org.githubOrgLogin} · </span>
                        )}
                        {org.members.length} member{org.members.length !== 1 ? 's' : ''} · {org.repoCount} repo{org.repoCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  {canManageMembers && (
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Invite Member
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-6 bg-navy-100 rounded-lg p-1 w-fit">
                <button
                  onClick={() => setActiveTab('members')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                    activeTab === 'members' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900'
                  }`}
                >
                  <Users className="w-4 h-4 inline mr-2" />
                  Members
                </button>
                {org.myRole === 'OWNER' && (
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                      activeTab === 'settings' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900'
                    }`}
                  >
                    <Settings className="w-4 h-4 inline mr-2" />
                    Settings
                  </button>
                )}
              </div>

              {/* Members Tab */}
              {activeTab === 'members' && (
                <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
                  <div className="divide-y divide-navy-100">
                    {org.members.map((member) => (
                      <div key={member.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-navy-100 rounded-full flex items-center justify-center">
                            {member.avatarUrl ? (
                              <img src={member.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                            ) : (
                              <User className="w-5 h-5 text-navy-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-navy-900">{member.name}</p>
                            <p className="text-sm text-navy-500">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-navy-50 rounded-full">
                            {getRoleIcon(member.role)}
                            <span className="text-sm text-navy-600 capitalize">{member.role.toLowerCase()}</span>
                          </div>
                          {canManageMembers && member.role !== 'OWNER' && (
                            <button className="p-1.5 text-navy-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  {/* General Settings */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-navy-100">
                    <h2 className="text-lg font-semibold text-navy-900 mb-4">General</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-navy-700 mb-1">
                          Organization Name
                        </label>
                        <input
                          defaultValue={org.name}
                          className="w-full px-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                      <button className="px-4 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition">
                        Save Changes
                      </button>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="bg-white rounded-xl p-6 shadow-sm border border-red-200">
                    <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
                    <p className="text-navy-600 text-sm mb-4">
                      Deleting this organization will remove all members and unlink all repositories. This action cannot be undone.
                    </p>
                    <button className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Delete Organization
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <InviteMemberModal onClose={() => setShowInviteModal(false)} orgId={orgId} />
      )}
    </div>
  );
}

function InviteMemberModal({ onClose, orgId }: { onClose: () => void; orgId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) return;
    
    setInviting(true);
    try {
      // TODO: Call API to invite member
      // await inviteOrganizationMember(orgId, { email, role });
      console.log('Inviting:', { email, role, orgId });
      onClose();
    } catch (err) {
      console.error('Failed to invite:', err);
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-navy-100">
          <h2 className="text-xl font-bold text-navy-900">Invite Team Member</h2>
          <p className="text-navy-600 text-sm mt-1">
            They&apos;ll receive an email invitation to join your organization
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full px-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'ADMIN' | 'MEMBER')}
              className="w-full px-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="MEMBER">Member — Can view and edit releases</option>
              <option value="ADMIN">Admin — Can also manage members</option>
            </select>
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
            onClick={handleInvite}
            disabled={inviting || !email.trim()}
            className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {inviting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}
