'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { AlertCircle, Building2, Crown, Loader2, Shield, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getOrganizations, getUser, isAuthenticated, type User } from '../../../lib/api';

// Local type extending the API Organization with a derived role field
interface Organization {
  id: string;
  name: string;
  slug: string;
  githubOrgLogin: string | null;
  memberCount: number;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export default function OrganizationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [user, setUser] = useState<User | null>(null);

  const router = useRouter();

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
        const orgsData = await getOrganizations();
        setOrganizations(
          orgsData.organizations.map((org) => ({
            ...org,
            role: org.ownerId === userData.id ? 'OWNER' as const : 'MEMBER' as const,
          }))
        );
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
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-navy-900">Organizations</h1>
            <p className="text-navy-600 mt-1">View your existing team workspaces</p>
          </div>

        </div>

        <p role="status" className="mb-6 rounded-xl border border-navy-200 bg-white p-4 text-sm text-navy-600">
          New organization setup and team invitations are not available yet. Existing organizations remain accessible below.
        </p>

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
                <p className="text-navy-600 max-w-md mx-auto">
                  You can connect repositories and publish release notes from your personal dashboard.
                </p>
                <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-navy-900 px-5 py-3 text-white hover:bg-navy-800">Go to Repositories</Link>
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


    </DashboardLayout >
  );
}
