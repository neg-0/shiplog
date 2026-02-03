'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, ArrowLeft, ExternalLink, Tag, Calendar, Users, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';

const mockUser = {
  name: 'Dustin',
  avatar: 'https://github.com/neg-0.png',
};

// Mock repo data - in real app would fetch based on id
const mockRepos: Record<string, {
  id: string;
  name: string;
  fullName: string;
  description: string;
  lastRelease: string | null;
  lastReleaseDate: string | null;
  status: string;
  releases: Array<{
    version: string;
    date: string;
    changes: number;
  }>;
  audiences: string[];
}> = {
  '1': {
    id: '1',
    name: 'comp-iq',
    fullName: 'neg-0/comp-iq',
    description: 'Commercial real estate analytics platform',
    lastRelease: 'v2.4.0',
    lastReleaseDate: '2 days ago',
    status: 'active',
    releases: [
      { version: 'v2.4.0', date: '2 days ago', changes: 5 },
      { version: 'v2.3.0', date: '5 days ago', changes: 8 },
      { version: 'v2.2.0', date: '2 weeks ago', changes: 12 },
    ],
    audiences: ['Developers', 'Product Managers', 'End Users'],
  },
  '2': {
    id: '2',
    name: 'shiplog',
    fullName: 'neg-0/shiplog',
    description: 'Multi-audience changelog SaaS',
    lastRelease: null,
    lastReleaseDate: null,
    status: 'pending',
    releases: [],
    audiences: [],
  },
};

export default function RepoDetailPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const params = useParams();
  const repoId = params.id as string;
  
  const repo = mockRepos[repoId] || {
    id: repoId,
    name: 'Unknown',
    fullName: 'unknown/repo',
    description: 'Repository not found',
    lastRelease: null,
    lastReleaseDate: null,
    status: 'unknown',
    releases: [],
    audiences: [],
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
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white"
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
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition"
            onClick={() => setSidebarOpen(false)}
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
      <main className="lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <Link 
            href="/dashboard"
            className="inline-flex items-center gap-2 text-navy-600 hover:text-navy-900 mb-6 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Repositories
          </Link>

          {/* Repo Header */}
          <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 lg:w-16 lg:h-16 bg-navy-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <GitBranch className="w-6 h-6 lg:w-8 lg:h-8 text-navy-600" />
                </div>
                <div>
                  <h1 className="text-xl lg:text-2xl font-bold text-navy-900">{repo.fullName}</h1>
                  <p className="text-navy-600">{repo.description}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <a 
                  href={`https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm text-navy-600 border border-navy-200 rounded-lg hover:bg-navy-50 transition flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on GitHub
                </a>
                <button className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Generate Changelog
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Releases */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Tag className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Recent Releases</h2>
              </div>
              {repo.releases.length > 0 ? (
                <div className="space-y-3">
                  {repo.releases.map((release, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-navy-100 last:border-0">
                      <div>
                        <p className="font-medium text-navy-900">{release.version}</p>
                        <p className="text-sm text-navy-500">{release.changes} changes</p>
                      </div>
                      <span className="text-sm text-navy-400">{release.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-navy-500">No releases yet. Create your first release to get started.</p>
              )}
            </div>

            {/* Audiences */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Audiences</h2>
              </div>
              {repo.audiences.length > 0 ? (
                <div className="space-y-2">
                  {repo.audiences.map((audience, idx) => (
                    <div key={idx} className="px-3 py-2 bg-navy-50 rounded-lg text-navy-700">
                      {audience}
                    </div>
                  ))}
                  <button className="w-full px-3 py-2 border border-dashed border-navy-300 rounded-lg text-navy-500 hover:border-teal-400 hover:text-teal-600 transition">
                    + Add Audience
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-navy-500 mb-4">No audiences configured yet.</p>
                  <button className="px-4 py-2 text-sm bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition">
                    Configure Audiences
                  </button>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Stats</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold text-navy-900">{repo.releases.length}</p>
                  <p className="text-sm text-navy-500">Total Releases</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-navy-900">{repo.audiences.length}</p>
                  <p className="text-sm text-navy-500">Audiences</p>
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100">
              <div className="flex items-center gap-3 mb-4">
                <Settings className="w-5 h-5 text-navy-600" />
                <h2 className="text-lg font-semibold text-navy-900">Repository Settings</h2>
              </div>
              <div className="space-y-3">
                <button className="w-full text-left px-4 py-3 bg-navy-50 rounded-lg text-navy-700 hover:bg-navy-100 transition">
                  Webhook Configuration
                </button>
                <button className="w-full text-left px-4 py-3 bg-navy-50 rounded-lg text-navy-700 hover:bg-navy-100 transition">
                  Changelog Templates
                </button>
                <button className="w-full text-left px-4 py-3 bg-navy-50 rounded-lg text-navy-700 hover:bg-navy-100 transition">
                  Notification Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
