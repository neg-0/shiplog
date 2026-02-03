'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, Clock, Tag, FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

const mockUser = {
  name: 'Dustin',
  avatar: 'https://github.com/neg-0.png',
};

const mockActivity = [
  {
    id: '1',
    type: 'release',
    repo: 'neg-0/comp-iq',
    title: 'v2.4.0 Released',
    description: 'Fixed RLS policies for company isolation',
    timestamp: '2 days ago',
  },
  {
    id: '2',
    type: 'changelog',
    repo: 'neg-0/comp-iq',
    title: 'Changelog generated',
    description: '3 new entries added for v2.4.0',
    timestamp: '2 days ago',
  },
  {
    id: '3',
    type: 'release',
    repo: 'neg-0/comp-iq',
    title: 'v2.3.0 Released',
    description: 'Added contact management improvements',
    timestamp: '5 days ago',
  },
];

export default function ActivityPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'release':
        return <Tag className="w-5 h-5 text-teal-500" />;
      case 'changelog':
        return <FileText className="w-5 h-5 text-blue-500" />;
      default:
        return <Clock className="w-5 h-5 text-navy-500" />;
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
            className="flex items-center gap-3 px-4 py-3 rounded-lg bg-navy-800 text-white"
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
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-navy-900">Activity</h1>
            <p className="text-navy-600">Recent releases and changelog updates</p>
          </div>

          {/* Activity List */}
          <div className="space-y-4">
            {mockActivity.map((item) => (
              <div 
                key={item.id}
                className="bg-white rounded-xl p-4 lg:p-6 shadow-sm border border-navy-100"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-navy-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    {getActivityIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h3 className="font-semibold text-navy-900">{item.title}</h3>
                      <span className="text-sm text-navy-400">{item.timestamp}</span>
                    </div>
                    <p className="text-sm text-navy-500 mt-1">{item.repo}</p>
                    <p className="text-navy-600 mt-2">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {mockActivity.length === 0 && (
            <div className="bg-white rounded-xl p-8 lg:p-12 text-center border border-navy-100">
              <Bell className="w-12 h-12 lg:w-16 lg:h-16 text-navy-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-navy-900 mb-2">No activity yet</h3>
              <p className="text-navy-600">Activity will appear here when you create releases</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
