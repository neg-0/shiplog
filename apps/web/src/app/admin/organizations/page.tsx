'use client';

import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Search, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../../components/AdminShell';
import { AdminApiError, adminGet } from '../../../lib/admin-api';
import { isAuthenticated } from '../../../lib/api';

interface Team {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  owner: { id: string; login: string; email: string | null; subscriptionTier: string; subscriptionStatus: string | null };
  memberCount: number;
  repoCount: number;
  members: { role: string; user: { id: string; login: string; email: string | null } }[];
  warnings: string[];
}
interface TeamResponse {
  organizations: Team[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<TeamResponse['pagination']>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    adminGet<TeamResponse>(`/organizations?${params}`).then(data => {
      if (!current) return;
      setTeams(data.organizations);
      setPagination(data.pagination);
      setError(null);
    }).catch((err: unknown) => {
      if (!current) return;
      if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
        router.replace(err.status === 401 ? '/login' : '/dashboard');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load teams.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, search, reload, router]);

  return (
    <AdminShell eyebrow="Organizations" title="Teams" description="Review owners, members, repositories and subscription links. Admin changes are disabled while team setup is incomplete.">
      <form onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Search teams</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Team name, slug or owner" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-teal-600" /></label>
        <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Search</button>
      </form>
      {loading ? <div role="status" className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading teams…</div> :
        error ? <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error}<button onClick={() => setReload(value => value + 1)} className="ml-3 font-semibold underline">Retry</button></div> :
        teams.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-slate-400" /><h2 className="mt-3 font-semibold">{search ? 'No matching teams' : 'No teams yet'}</h2><p className="mt-1 text-sm text-slate-500">{search ? 'Try another name or owner.' : 'Organizations created by Team plan users will appear here.'}</p></div> :
        <div className="mt-5 space-y-4">{teams.map(team => <section key={team.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{team.name}</h2><p className="mt-1 text-xs text-slate-500">/{team.slug} · Created {new Date(team.createdAt).toLocaleDateString()}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${team.warnings.length ? 'bg-amber-100 text-amber-900' : 'bg-teal-50 text-teal-900'}`}>{team.warnings.length ? `${team.warnings.length} checks needed` : 'No recorded warnings'}</span></div>
          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3"><div><p className="text-xs uppercase tracking-wide text-slate-500">Owner</p><p className="mt-1 text-sm font-semibold">@{team.owner.login}</p><p className="text-xs text-slate-500">{team.owner.email || 'No email'} · {team.owner.subscriptionTier} · {team.owner.subscriptionStatus || 'no status'}</p></div><div><p className="text-xs uppercase tracking-wide text-slate-500">Members</p><p className="mt-1 text-lg font-semibold tabular-nums">{team.memberCount}</p></div><div><p className="text-xs uppercase tracking-wide text-slate-500">Repositories</p><p className="mt-1 text-lg font-semibold tabular-nums">{team.repoCount}</p></div></div>
          {team.members.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Membership</p><div className="mt-2 flex flex-wrap gap-2">{team.members.map(member => <span key={member.user.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"><strong>@{member.user.login}</strong> · {member.role}</span>)}</div></div>}
          {team.warnings.length > 0 && <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4">{team.warnings.map(warning => <li key={warning} className="flex items-center gap-2 text-xs text-amber-900"><AlertTriangle className="h-4 w-4" />{warning}</li>)}</ul>}
        </section>)}</div>}
      {!loading && !error && pagination.pages > 1 && <div className="mt-5 flex items-center justify-between text-sm"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 font-medium text-slate-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-slate-500">Page {page} of {pagination.pages}</span><button onClick={() => setPage(value => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages} className="inline-flex items-center gap-1 font-medium text-slate-600 disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button></div>}
    </AdminShell>
  );
}
