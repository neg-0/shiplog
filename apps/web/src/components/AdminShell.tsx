'use client';

import { Activity, ArrowLeft, LayoutDashboard, Ship, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const navigation = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: UsersRound },
  { href: '/admin/organizations', label: 'Teams', icon: Activity },
];

export function AdminShell({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[#f5f7f6] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/admin" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"><Ship className="h-5 w-5" /></span>
            <span>ShipLog <span className="font-normal text-slate-500">/ Admin</span></span>
          </Link>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Customer dashboard
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-7 sm:px-8 lg:grid-cols-[180px_minmax(0,1fr)] lg:py-10">
        <nav aria-label="Admin navigation" className="flex gap-2 overflow-x-auto lg:flex-col">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium transition ${active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white hover:text-slate-950'}`}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
