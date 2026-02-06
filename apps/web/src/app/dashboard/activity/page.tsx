'use client';

import { DashboardLayout } from '@/components/DashboardLayout';
import { Bell, Clock, Tag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getActivity, getUser, isAuthenticated, type ActivityRelease, type User as UserType } from '../../../lib/api';

function formatTimeAgo(dateString: string | null) {
  if (!dateString) return 'Unknown time';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function ActivityPage() {

  const [activities, setActivities] = useState<ActivityRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserType | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [userData, activityData] = await Promise.all([
          getUser(),
          getActivity()
        ]);

        setUser(userData);
        setActivities(activityData.releases);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activity');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);



  return (
    <DashboardLayout user={user}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-navy-900">Activity</h1>
          <p className="text-navy-600">Recent releases across all your repositories</p>
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

        {!loading && !error && (
          <div className="space-y-4">
            {activities.map((item) => (
              <Link
                href={`/dashboard/releases/${item.id}`}
                key={item.id}
                className="block bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100 hover:border-teal-200 transition group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-teal-50 transition">
                    <Tag className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="font-semibold text-navy-900 group-hover:text-teal-700 transition">
                        [{item.repo.name}] {item.tagName}
                      </h3>
                      <span className="text-sm text-navy-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.publishedAt ? `published ${formatTimeAgo(item.publishedAt)}` : 'Draft'}
                      </span>
                    </div>
                    <p className="text-navy-600 mt-1 truncate">
                      {item.name || 'No title'}
                    </p>
                  </div>
                </div>
              </Link>
            ))}

            {activities.length === 0 && (
              <div className="bg-white rounded-xl p-8 lg:p-12 text-center border border-navy-100">
                <Bell className="w-12 h-12 lg:w-16 lg:h-16 text-navy-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-navy-900 mb-2">No activity yet</h3>
                <p className="text-navy-600">Activity will appear here when you have releases.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
