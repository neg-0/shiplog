'use client';

import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../../components/AdminShell';
import { AdminApiError, adminGet } from '../../../lib/admin-api';
import { isAuthenticated } from '../../../lib/api';

type Tier = 'FREE' | 'PRO' | 'TEAM';
interface UserRecord {
  id: string;
  login: string;
  name: string | null;
  email: string | null;
  subscriptionTier: Tier;
  subscriptionStatus: string | null;
  hasStripeSubscription: boolean;
  trialEndsAt: string | null;
  createdAt: string;
  repoCount: number;
  releaseCount: number;
  externalDeliveryCount: number;
}
interface UserResponse {
  users: UserRecord[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<UserResponse['pagination']>({ page: 1, limit: 20, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!isAuthenticated()) { router.replace('/login'); return; }
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    if (tier) params.set('tier', tier);
    adminGet<UserResponse>(`/users?${params}`).then(data => {
      if (!current) return;
      setUsers(data.users);
      setPagination(data.pagination);
      setError(null);
    }).catch((err: unknown) => {
      if (!current) return;
      if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
        router.replace(err.status === 401 ? '/login' : '/dashboard');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load users.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, search, tier, reload, router]);

  return (
    <AdminShell eyebrow="Accounts" title="Users" description="Inspect plan state and activity on repositories each account connected. Plan changes follow Stripe billing, and account deletion requires billing and webhook cleanup.">
      <form onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }} className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="relative min-w-[220px] flex-1">
          <span className="sr-only">Search users</span>
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, login or email" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-teal-600" />
        </label>
        <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Search</button>
        <label className="sr-only" htmlFor="tier-filter">Filter by tier</label>
        <select id="tier-filter" value={tier} onChange={event => { setTier(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <option value="">All plans</option><option value="FREE">Free</option><option value="PRO">Pro</option><option value="TEAM">Team</option>
        </select>
      </form>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div role="status" className="flex items-center gap-2 p-8 text-sm text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading users…</div> :
          error ? <div role="alert" className="p-6 text-sm text-rose-700">{error}<button onClick={() => setReload(value => value + 1)} className="ml-3 font-semibold underline">Retry</button></div> :
          users.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No users match this search.</div> :
          <div className="overflow-x-auto"><p className="px-5 pt-3 text-xs text-slate-500 sm:hidden">Swipe to see repository activity and join date →</p><table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>
              <th scope="col" className="px-5 py-4">User</th><th scope="col" className="px-5 py-4">Plan and billing</th><th scope="col" className="px-5 py-4 text-right">Repos connected</th><th scope="col" className="px-5 py-4 text-right">Repo releases</th><th scope="col" className="px-5 py-4 text-right">Repo sends</th><th scope="col" className="px-5 py-4">Joined</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{users.map(user => <tr key={user.id}>
              <td className="px-5 py-4"><p className="font-semibold text-slate-900">{user.name || user.login}</p><p className="text-xs text-slate-500">@{user.login}{user.email ? ` · ${user.email}` : ''}</p></td>
              <td className="px-5 py-4"><span className="inline-block rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">{user.subscriptionTier}</span><p className="mt-1 text-xs text-slate-500">{user.subscriptionStatus || 'No subscription status'}{user.trialEndsAt && user.subscriptionStatus === 'trialing' ? ` · ends ${new Date(user.trialEndsAt).toLocaleDateString()}` : ''}{!user.hasStripeSubscription && user.subscriptionTier !== 'FREE' ? ' · no linked subscription' : ''}</p></td>
              <td className="px-5 py-4 text-right tabular-nums">{user.repoCount}</td><td className="px-5 py-4 text-right tabular-nums">{user.releaseCount}</td><td className="px-5 py-4 text-right tabular-nums">{user.externalDeliveryCount}</td><td className="px-5 py-4 text-slate-500">{new Date(user.createdAt).toLocaleDateString()}</td>
            </tr>)}</tbody>
          </table></div>}
        {!loading && !error && pagination.pages > 1 && <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
          <button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 font-medium text-slate-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
          <span className="text-slate-500">Page {page} of {pagination.pages} · {pagination.total} users</span>
          <button onClick={() => setPage(value => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages} className="inline-flex items-center gap-1 font-medium text-slate-600 disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
        </div>}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">All-time release and successful external send counts are attributed to the account that connected each repository, including team repositories. They do not identify who published. Sends count distribution records, including email and webhook channels; hosted pages are excluded. Pull requests used to generate notes are not stored, so PR counts per user are unavailable.</p>
    </AdminShell>
  );
}
