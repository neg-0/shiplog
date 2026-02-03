import { Ship, Settings, GitBranch, Bell, LogOut, Plus } from 'lucide-react';
import Link from 'next/link';

// This would come from auth/session in real implementation
const mockUser = {
  name: 'Dustin',
  avatar: 'https://github.com/neg-0.png',
};

const mockRepos = [
  {
    id: '1',
    name: 'comp-iq',
    fullName: 'neg-0/comp-iq',
    lastRelease: 'v2.4.0',
    lastReleaseDate: '2 days ago',
    status: 'active',
  },
  {
    id: '2',
    name: 'shiplog',
    fullName: 'neg-0/shiplog',
    lastRelease: null,
    lastReleaseDate: null,
    status: 'pending',
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-navy-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-navy-900 text-white p-6">
        <div className="flex items-center gap-2 mb-8">
          <Ship className="w-8 h-8 text-teal-400" />
          <span className="text-xl font-bold">ShipLog</span>
        </div>

        <nav className="space-y-2">
          <Link 
            href="/dashboard" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white"
          >
            <GitBranch className="w-5 h-5" />
            Repositories
          </Link>
          <Link 
            href="/dashboard/activity" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition"
          >
            <Bell className="w-5 h-5" />
            Activity
          </Link>
          <Link 
            href="/dashboard/settings" 
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition"
          >
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex items-center gap-3 px-4 py-3 bg-navy-800 rounded-lg">
            <img 
              src={mockUser.avatar} 
              alt={mockUser.name}
              className="w-8 h-8 rounded-full"
            />
            <span className="font-medium flex-1">{mockUser.name}</span>
            <button className="text-navy-400 hover:text-white transition">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 p-8">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-navy-900">Repositories</h1>
              <p className="text-navy-600">Manage your connected repos and release settings</p>
            </div>
            <button className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-500 transition flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Connect Repo
            </button>
          </div>

          {/* Repo List */}
          <div className="space-y-4">
            {mockRepos.map((repo) => (
              <Link 
                key={repo.id}
                href={`/dashboard/repos/${repo.id}`}
                className="block bg-white rounded-xl p-6 shadow-sm border border-navy-100 hover:shadow-md hover:border-teal-200 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-navy-100 rounded-lg flex items-center justify-center">
                      <GitBranch className="w-6 h-6 text-navy-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-navy-900">{repo.fullName}</h3>
                      {repo.lastRelease ? (
                        <p className="text-sm text-navy-500">
                          Last release: <span className="font-medium">{repo.lastRelease}</span> · {repo.lastReleaseDate}
                        </p>
                      ) : (
                        <p className="text-sm text-navy-400">No releases yet</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {repo.status === 'active' ? (
                      <span className="px-3 py-1 bg-teal-100 text-teal-700 text-sm font-medium rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
                        Setup needed
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Empty State (when no repos) */}
          {mockRepos.length === 0 && (
            <div className="bg-white rounded-xl p-12 text-center border border-navy-100">
              <Ship className="w-16 h-16 text-navy-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-navy-900 mb-2">No repos connected</h3>
              <p className="text-navy-600 mb-6">Connect your first GitHub repository to get started</p>
              <button className="bg-navy-900 text-white px-6 py-3 rounded-lg hover:bg-navy-800 transition">
                Connect Repository
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
