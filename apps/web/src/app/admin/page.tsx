'use client';

import { AlertTriangle, ArrowRight, Clock3, GitBranch, Loader2, Radio, Sparkles, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../components/AdminShell';
import { AdminApiError, adminGet } from '../../lib/admin-api';
import { isAuthenticated } from '../../lib/api';
import { formatRelativeDate } from '../../lib/utils';

interface Metrics {
  periodDays: number;
  users: { total: number; free: number; pro: number; team: number; new: number };
  organizations: number;
  repos: { total: number; active: number; error: number };
  releases: { total: number; new: number; needingAttention: number; stuckProcessing: number };
  deliveries: { sentExternal: number; failedExternalAttempts: number };
  ai: { savedDrafts: number; recordedTokens: number; missingTokenCounts: number };
  billing: {
    activePaidPlanRecords: number;
    trialingPlanRecords: number;
    pastDuePlanRecords: number;
    paidTierWithoutSubscription: number;
    collectedRevenue: null;
    mrr: null;
    reason: string;
  };
}

interface ActivityEvent {
  type: 'signup' | 'release' | 'delivery';
  id: string;
  description: string;
  createdAt: string;
}

const number = (value: number) => new Intl.NumberFormat('en-US').format(value);

function StatCard({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: typeof UsersRound }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <Icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
      </div>
      <p className="mt-5 text-3xl font-semibold tabular-nums tracking-tight">{number(value)}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [reload, setReload] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    let current = true;
    setLoading(true);
    Promise.all([
      adminGet<Metrics>('/metrics'),
      adminGet<{ events: ActivityEvent[] }>('/activity?limit=12'),
    ]).then(([nextMetrics, nextActivity]) => {
      if (!current) return;
      setMetrics(nextMetrics);
      setActivity(nextActivity.events);
      setError(null);
    }).catch((err: unknown) => {
      if (!current) return;
      if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
        router.replace(err.status === 401 ? '/login' : '/dashboard');
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load the admin dashboard.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [reload, router]);

  const warnings = metrics ? [
    { count: metrics.repos.error, label: 'repositories in error state' },
    { count: metrics.releases.needingAttention, label: 'releases failed or partly delivered' },
    { count: metrics.releases.stuckProcessing, label: 'releases processing for over 15 minutes' },
    { count: metrics.billing.pastDuePlanRecords, label: 'past-due plan records' },
    { count: metrics.billing.paidTierWithoutSubscription, label: 'paid-tier users without a linked subscription' },
  ].filter(item => item.count > 0) : [];

  return (
    <AdminShell eyebrow="Operations" title="A clear view of the fleet" description="Account, release and delivery signals recorded by ShipLog. Recent metrics cover the last 30 days unless noted.">
      {loading && <div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-slate-600"><Loader2 className="h-5 w-5 animate-spin" /> Loading operational data…</div>}
      {!loading && error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error}<button onClick={() => setReload(value => value + 1)} className="ml-3 font-semibold underline">Retry</button></div>}
      {!loading && !error && metrics && <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Users" value={metrics.users.total} detail={`${metrics.users.new} joined in the last 30 days`} icon={UsersRound} />
          <StatCard label="Connected repositories" value={metrics.repos.total} detail={`${metrics.repos.active} in active state`} icon={GitBranch} />
          <StatCard label="Releases received" value={metrics.releases.total} detail={`${metrics.releases.new} received in the last 30 days`} icon={Radio} />
          <StatCard label="Teams" value={metrics.organizations} detail="Organization records" icon={UsersRound} />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Plan mix">
            <div className="mt-5 grid grid-cols-3 gap-3">
              {([['Free', metrics.users.free], ['Pro', metrics.users.pro], ['Team', metrics.users.team]] as const).map(([label, value]) =>
                <div key={label} className="rounded-xl bg-slate-50 px-4 py-4"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{number(value)}</p></div>
              )}
            </div>
            <Link href="/admin/users" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:text-teal-950">Inspect users <ArrowRight className="h-4 w-4" /></Link>
          </Panel>

          <Panel title="Billing state">
            <p className="mt-2 text-sm text-slate-600">Local subscription records show the current plan state. Changes over time are not tracked yet.</p>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div><dt className="text-xs text-slate-500">Active paid plan</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{number(metrics.billing.activePaidPlanRecords)}</dd></div>
              <div><dt className="text-xs text-slate-500">Trialing</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{number(metrics.billing.trialingPlanRecords)}</dd></div>
              <div><dt className="text-xs text-slate-500">Past due</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{number(metrics.billing.pastDuePlanRecords)}</dd></div>
            </dl>
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Revenue and MRR unavailable.</strong> {metrics.billing.reason} These counts do not account for discounts, grandfathered prices, tax, or collected payments.</div>
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title="Delivery and AI activity">
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-teal-50 p-4"><p className="text-xs text-teal-800">External sends recorded · 30 days</p><p className="mt-2 text-2xl font-semibold tabular-nums text-teal-950">{number(metrics.deliveries.sentExternal)}</p></div>
              <div className="rounded-xl bg-rose-50 p-4"><p className="text-xs text-rose-800">Failed external attempts · 30 days</p><p className="mt-2 text-2xl font-semibold tabular-nums text-rose-950">{number(metrics.deliveries.failedExternalAttempts)}</p></div>
            </div>
            <div className="mt-5 flex items-start gap-3 border-t border-slate-100 pt-5"><Sparkles className="mt-0.5 h-5 w-5 text-teal-700" /><div><p className="text-sm font-semibold">{number(metrics.ai.recordedTokens)} tokens on {number(metrics.ai.savedDrafts)} current saved drafts created in the last 30 days</p><p className="mt-1 text-xs leading-5 text-slate-500">{number(metrics.ai.missingTokenCounts)} drafts have no token count. Regeneration can overwrite recorded usage, so this is not total provider usage or spend.</p></div></div>
          </Panel>

          <Panel title="Needs attention">
            {warnings.length === 0 ? <p className="mt-5 rounded-xl bg-teal-50 p-4 text-sm text-teal-900">No current status warnings in the tracked categories.</p> :
              <ul className="mt-4 space-y-3">{warnings.map(item => <li key={item.label} className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /><strong>{number(item.count)}</strong> {item.label}</li>)}</ul>}
            <p className="mt-4 text-xs leading-5 text-slate-500">Failed delivery attempts are historical records. Release status shows cases still marked failed or partly delivered.</p>
          </Panel>
        </div>

        <Panel title="Recent activity">
          {activity.length === 0 ? <p className="mt-4 text-sm text-slate-500">No recorded signups, releases or external sends yet.</p> :
            <ol className="mt-4 divide-y divide-slate-100">{activity.map(event => <li key={`${event.type}-${event.id}`} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"><span className="flex min-w-0 items-start gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span className="break-words">{event.description}</span></span><time className="pl-7 text-xs text-slate-500" dateTime={event.createdAt}>{formatRelativeDate(event.createdAt)}</time></li>)}</ol>}
        </Panel>
      </div>}
    </AdminShell>
  );
}
