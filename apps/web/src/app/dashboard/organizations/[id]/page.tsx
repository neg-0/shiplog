'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { AlertDialog } from '@/components/Dialog';
import { AlertCircle, ArrowLeft, Building2, Crown, Loader2, Mail, Plus, Settings, Shield, Trash2, User, Users } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  getOrganization,
  getUser,
  inviteOrganizationMember,
  isAuthenticated,
  removeOrganizationMember,
  updateOrganization,
  type User as UserType,
} from '../../../../lib/api';

interface OrgMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  githubOrgId: number | null;
  githubOrgLogin: string | null;
  members: OrgMember[];
  repoCount: number;
  myRole: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export default function OrganizationDetailPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'settings'>('members');
  const [user, setUser] = useState<UserType | null>(null);
  const [settingsName, setSettingsName] = useState('');
  const [saving, setSaving] = useState(false);

  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;

  const refreshOrg = useCallback(async () => {
    const userData = await getUser();
    setUser(userData);
    const orgData = await getOrganization(orgId);

    const members: OrgMember[] = orgData.members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name || m.user.login,
      email: m.user.email || '',
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    let myRole: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER';
    if (orgData.ownerId === userData.id) {
      myRole = 'OWNER';
    } else {
      const myMember = orgData.members.find((m) => m.user.id === userData.id);
      if (myMember) {
        myRole = myMember.role;
      }
    }

    const detail: OrgDetail = {
      id: orgData.id,
      name: orgData.name,
      slug: orgData.slug,
      githubOrgId: orgData.githubOrgId,
      githubOrgLogin: orgData.githubOrgLogin,
      members,
      repoCount: orgData.repos.length,
      myRole,
    };

    setOrg(detail);
    setSettingsName(detail.name);
  }, [orgId]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchOrg = async () => {
      try {
        setLoading(true);
        await refreshOrg();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organization');
      } finally {
        setLoading(false);
      }
    };

    fetchOrg();
  }, [orgId, router, refreshOrg]);

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeOrganizationMember(orgId, userId);
      await refreshOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleSaveSettings = async () => {
    if (!settingsName.trim() || settingsName === org?.name) return;

    setSaving(true);
    try {
      await updateOrganization(orgId, { name: settingsName.trim() });
      await refreshOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'OWNER': return <Crown className="w-4 h-4 text-amber-500" />;
      case 'ADMIN': return <Shield className="w-4 h-4 text-blue-500" />;
      default: return <User className="w-4 h-4 text-navy-400" />;
    }
  };

  const canManageMembers = org?.myRole === 'OWNER' || org?.myRole === 'ADMIN';

  return (
    <DashboardLayout user={user}>
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
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'members' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900'
                  }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Members
              </button>
              {org.myRole === 'OWNER' && (
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === 'settings' ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900'
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
                          <button
                            onClick={() => handleRemoveMember(member.userId)}
                            className="p-1.5 text-navy-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          >
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
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        className="w-full px-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <button
                      onClick={handleSaveSettings}
                      disabled={saving || !settingsName.trim() || settingsName === org.name}
                      className="px-4 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving && <Loader2 className="w-4 h-4 animate-spin" />}
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
                  <button
                    onClick={() => setShowDeleteAlert(true)}
                    className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Organization
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>


      {/* Invite Modal */}
      {showInviteModal && (
        <InviteMemberModal
          onClose={() => setShowInviteModal(false)}
          onInvited={async () => {
            setShowInviteModal(false);
            await refreshOrg();
          }}
          orgId={orgId}
        />
      )}

      {/* Delete Alert */}
      <AlertDialog
        isOpen={showDeleteAlert}
        onClose={() => setShowDeleteAlert(false)}
        title="Cannot Delete Organization"
        message="Organization deletion is not yet supported. Please contact support if you need to delete this organization."
        variant="error"
      />
    </DashboardLayout >
  );
}

function InviteMemberModal({ onClose, onInvited, orgId }: { onClose: () => void; onInvited: () => void; orgId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!email.trim()) return;

    setInviting(true);
    setInviteError(null);
    try {
      await inviteOrganizationMember(orgId, { email, role });
      onInvited();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite');
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

          {inviteError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{inviteError}</p>
            </div>
          )}
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
