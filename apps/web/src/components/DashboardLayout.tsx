'use client';

import { Ship, Settings, GitBranch, Bell, LogOut, Menu, X, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { logout, type User } from '../lib/api';
import { DashboardFeedbackWidget } from './DashboardFeedbackWidget';

interface DashboardLayoutProps {
  children: React.ReactNode;
  user: User | null;
}

export function DashboardLayout({ children, user }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOpen]);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch {
      setLogoutError('Could not sign out. Please try again.');
    }
  };

  const navItems = [
    { href: '/dashboard', icon: GitBranch, label: 'Repositories', exact: true },
    { href: '/dashboard/organizations', icon: Building2, label: 'Organizations' },
    { href: '/dashboard/activity', icon: Bell, label: 'Activity' },
    { href: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
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
          aria-label="Toggle menu"
          aria-expanded={sidebarOpen}
          aria-controls="dashboard-sidebar"
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
      <aside id="dashboard-sidebar" className={`
        fixed left-0 top-0 h-full w-64 bg-navy-900 text-white p-6 z-50
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0 visible' : '-translate-x-full invisible'}
        lg:translate-x-0 lg:visible
      `}>
        <Link href="/dashboard" className="flex items-center gap-2 mb-8 mt-2 lg:mt-0">
          <Ship className="w-8 h-8 text-teal-400" />
          <span className="text-xl font-bold">ShipLog</span>
        </Link>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link 
                key={item.href}
                href={item.href} 
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  active 
                    ? 'bg-navy-800 text-white' 
                    : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          {logoutError && <p role="alert" className="mb-3 text-sm text-red-200">{logoutError}</p>}
          {user ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-navy-800 rounded-lg">
              <img
                src={user.avatarUrl || 'https://github.com/github.png'}
                alt={user.name || user.login}
                className="w-8 h-8 rounded-full"
              />
              <span className="font-medium flex-1 truncate">{user.name || user.login}</span>
              <button
                onClick={handleLogout}
                className="text-navy-400 hover:text-white transition"
                title="Logout"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-navy-800 rounded-lg animate-pulse">
              <div className="w-8 h-8 rounded-full bg-navy-700" />
              <div className="flex-1"><div className="h-4 bg-navy-700 rounded w-24" /></div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8 min-h-screen">
        {children}
      </main>

      {/* Feedback Widget */}
      <DashboardFeedbackWidget />
    </div>
  );
}
