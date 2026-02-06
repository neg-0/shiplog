'use client';

import { Ship, Users, BarChart3, Activity, Loader2, Search, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../../../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.shiplog.io';

interface User {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  subscriptionTier: string;
  subscriptionStatus: string | null;
  createdAt: string;
  repoCount: number;
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('shiplog_token');
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (tierFilter) params.set('tier', tierFilter);

      const res = await fetch(`${API_URL}/admin/users?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.status === 403) {
        router.push('/dashboard');
        return;
      }

      const data = await res.json();
      setUsers(data.users);
      setTotalPages(data.pagination.pages);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    fetchUsers();
  }, [page, tierFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleChangeTier = async (userId: string, newTier: string) => {
    const token = localStorage.getItem('shiplog_token');
    await fetch(`${API_URL}/admin/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscriptionTier: newTier }),
    });
    fetchUsers();
  };

  const handleDelete = async (userId: string, login: string) => {
    if (!confirm(`Delete user ${login}? This cannot be undone.`)) return;
    
    const token = localStorage.getItem('shiplog_token');
    await fetch(`${API_URL}/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    fetchUsers();
  };

  return (
    <div className="min-h-screen bg-navy-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-navy-900 text-white p-6">
        <div className="flex items-center gap-2 mb-8">
          <Ship className="w-8 h-8 text-teal-400" />
          <span className="text-xl font-bold">ShipLog Admin</span>
        </div>

        <nav className="space-y-2">
          <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition">
            <BarChart3 className="w-5 h-5" />
            Dashboard
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white">
            <Users className="w-5 h-5" />
            Users
          </Link>
          <Link href="/admin/activity" className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition">
            <Activity className="w-5 h-5" />
            Activity
          </Link>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <Link href="/dashboard" className="flex items-center gap-2 px-4 py-2 text-navy-400 hover:text-white transition text-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-navy-900 mb-6">Users</h1>

          {/* Filters */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-6 flex flex-wrap gap-4">
            <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, or login..."
                  className="w-full pl-10 pr-4 py-2 border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </form>
            <select
              value={tierFilter}
              onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
              className="px-4 py-2 border border-navy-200 rounded-lg bg-white"
            >
              <option value="">All Tiers</option>
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="TEAM">Team</option>
            </select>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-navy-50 border-b border-navy-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-navy-600">User</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-navy-600">Email</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-navy-600">Tier</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-navy-600">Repos</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-navy-600">Joined</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-navy-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-navy-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatarUrl || 'https://github.com/github.png'}
                            alt=""
                            className="w-8 h-8 rounded-full"
                          />
                          <div>
                            <p className="font-medium text-navy-900">{user.name || user.login}</p>
                            <p className="text-sm text-navy-500">@{user.login}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-navy-600">{user.email || '-'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={user.subscriptionTier}
                          onChange={(e) => handleChangeTier(user.id, e.target.value)}
                          className={`px-2 py-1 rounded text-sm font-medium ${
                            user.subscriptionTier === 'TEAM' ? 'bg-purple-100 text-purple-700' :
                            user.subscriptionTier === 'PRO' ? 'bg-teal-100 text-teal-700' :
                            'bg-navy-100 text-navy-700'
                          }`}
                        >
                          <option value="FREE">Free</option>
                          <option value="PRO">Pro</option>
                          <option value="TEAM">Team</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-navy-600">{user.repoCount}</td>
                      <td className="px-4 py-3 text-navy-600">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(user.id, user.login)}
                          className="p-2 text-navy-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-navy-100">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1 text-navy-600 hover:bg-navy-100 rounded disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <span className="text-navy-600">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-1 text-navy-600 hover:bg-navy-100 rounded disabled:opacity-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
