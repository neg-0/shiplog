'use client';

import { Ship, Users, BarChart3, Activity, Settings, Loader2, DollarSign, GitBranch, Tag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated, getUser } from '../../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.shiplog.io';

interface Metrics {
  users: { total: number; free: number; pro: number; team: number };
  repos: number;
  releases: number;
  mrr: number;
}

interface ActivityEvent {
  type: 'signup' | 'release';
  id: string;
  description: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        const token = localStorage.getItem('shiplog_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [metricsRes, activityRes] = await Promise.all([
          fetch(`${API_URL}/admin/metrics`, { headers }),
          fetch(`${API_URL}/admin/activity?limit=20`, { headers }),
        ]);

        if (metricsRes.status === 403) {
          router.push('/dashboard');
          return;
        }

        if (!metricsRes.ok) throw new Error('Failed to load metrics');

        const [metricsData, activityData] = await Promise.all([
          metricsRes.json(),
          activityRes.ok ? activityRes.json() : { events: [] },
        ]);

        setMetrics(metricsData);
        setActivity(activityData.events || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
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
          <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white">
            <BarChart3 className="w-5 h-5" />
            Dashboard
          </Link>
          <Link href="/admin/users" className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition">
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
          <h1 className="text-2xl font-bold text-navy-900 mb-8">Dashboard</h1>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && metrics && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center justify-between mb-2">
                    <Users className="w-8 h-8 text-navy-400" />
                    <span className="text-2xl font-bold text-navy-900">{metrics.users.total}</span>
                  </div>
                  <p className="text-navy-600">Total Users</p>
                  <div className="mt-2 text-sm text-navy-500">
                    {metrics.users.free} free · {metrics.users.pro} pro · {metrics.users.team} team
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center justify-between mb-2">
                    <GitBranch className="w-8 h-8 text-navy-400" />
                    <span className="text-2xl font-bold text-navy-900">{metrics.repos}</span>
                  </div>
                  <p className="text-navy-600">Connected Repos</p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-navy-100">
                  <div className="flex items-center justify-between mb-2">
                    <Tag className="w-8 h-8 text-navy-400" />
                    <span className="text-2xl font-bold text-navy-900">{metrics.releases}</span>
                  </div>
                  <p className="text-navy-600">Releases Generated</p>
                </div>

                <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-6 shadow-sm text-white">
                  <div className="flex items-center justify-between mb-2">
                    <DollarSign className="w-8 h-8 text-white/80" />
                    <span className="text-2xl font-bold">${metrics.mrr}</span>
                  </div>
                  <p className="text-white/90">Monthly Recurring Revenue</p>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl shadow-sm border border-navy-100">
                <div className="p-4 border-b border-navy-100">
                  <h2 className="text-lg font-semibold text-navy-900">Recent Activity</h2>
                </div>
                <div className="divide-y divide-navy-100">
                  {activity.slice(0, 10).map((event) => (
                    <div key={`${event.type}-${event.id}`} className="p-4 flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        event.type === 'signup' ? 'bg-blue-100' : 'bg-teal-100'
                      }`}>
                        {event.type === 'signup' ? (
                          <Users className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Tag className="w-4 h-4 text-teal-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-navy-900">{event.description}</p>
                      </div>
                      <span className="text-sm text-navy-500">{formatTimeAgo(event.createdAt)}</span>
                    </div>
                  ))}
                  {activity.length === 0 && (
                    <div className="p-8 text-center text-navy-500">
                      No activity yet
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
