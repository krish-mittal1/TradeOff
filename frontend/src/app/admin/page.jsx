'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Activity, DatabaseZap, Lock, ShieldCheck, Users } from 'lucide-react'
import { ProductShell, EmptyState, StatusPill, StatCard } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

const NAV = (
  <div className="mb-6 flex gap-4 border-b border-white/5 pb-3 text-xs">
    <Link href="/admin" className="text-amber-400 font-semibold border-b border-amber-400 pb-3 -mb-3.5">Dashboard</Link>
    <Link href="/admin/users" className="text-slate-500 hover:text-slate-300">Manage Users</Link>
    <Link href="/admin/assets" className="text-slate-500 hover:text-slate-300">Trading Pairs</Link>
    <Link href="/admin/trades" className="text-slate-500 hover:text-slate-300">Trade History</Link>
  </div>
)

export default function AdminPage() {
  const { data, error } = useQuery({ queryKey: ['admin-users'], queryFn: () => apiClient.get('/admin/users'), retry: 1 })
  const opsQuery = useQuery({ queryKey: ['reconciliation'], queryFn: () => apiClient.get('/operations/reconciliation'), retry: 1 })
  const outboxQuery = useQuery({ queryKey: ['outbox'], queryFn: () => apiClient.get('/operations/outbox'), retry: 1 })
  const users = data?.users || []
  const runs = opsQuery.data?.runs || []
  const events = outboxQuery.data?.events || []
  const pendingEvents = events.filter((event) => event.status === 'PENDING').length

  async function reconcile() {
    try {
      await apiClient.post('/operations/reconciliation/run')
      toast.success('Reconciliation run completed')
      opsQuery.refetch()
    } catch (err) {
      toast.error(err.message || 'Could not run reconciliation')
    }
  }

  if (error) {
    return (
      <ProductShell title="Admin" subtitle="User operations, risk review, and exchange oversight.">
        {NAV}
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-rose-500/10 ring-1 ring-rose-500/20">
            <Lock size={26} className="text-rose-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Admin access required</h3>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Your account does not have the admin role. Contact an administrator to request access.
          </p>
          <Link
            href="/"
            className="mt-8 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Back to trading
          </Link>
        </div>
      </ProductShell>
    )
  }

  return <ProductShell title="Admin" subtitle="User operations, risk review, and exchange oversight.">
    {NAV}
    <div className="mb-4 grid gap-3 md:grid-cols-3">
      <button onClick={reconcile} className="panel stat-card flex items-center justify-between p-5 text-left text-sm text-amber-400 hover:border-amber-400/30">
        <span><span className="block text-xs uppercase tracking-[0.16em] text-slate-500">Operations</span><span className="mt-3 block text-xl font-semibold text-white">Run reconciliation</span></span>
        <DatabaseZap size={22} />
      </button>
      <StatCard label="Users" value={users.length} detail="Accounts visible to admin" />
      <StatCard label="Pending outbox" value={pendingEvents} detail="Events waiting to be delivered" />
    </div>
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="panel overflow-hidden">
        <div className="panel-title"><span className="flex items-center gap-2"><Users size={15} /> Users</span><StatusPill>{users.length} total</StatusPill></div>
        <div className="grid grid-cols-4 border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-slate-600"><span>User</span><span>Status</span><span>KYC</span><span>MFA</span></div>
        {users.length ? users.map((user) => <div key={user.id} className="asset-row grid grid-cols-4 border-b border-white/5 px-4 py-4 text-sm"><span className="truncate text-white">{user.email}</span><span><StatusPill tone={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status}</StatusPill></span><span>Level {user.kyc_level}</span><span className={user.mfa_enabled ? 'text-emerald-400' : 'text-slate-500'}>{user.mfa_enabled ? 'Enabled' : 'Disabled'}</span></div>) : <EmptyState>No users found.</EmptyState>}
      </div>
      <div className="space-y-4">
        <div className="panel overflow-hidden">
          <div className="panel-title"><span className="flex items-center gap-2"><ShieldCheck size={15} /> Reconciliation</span></div>
          {runs.length ? runs.slice(0, 5).map((run) => <div key={run.id} className="border-b border-white/5 px-4 py-3 text-xs">
            <div className="mb-1 flex items-center justify-between"><span className="font-mono text-slate-300">{run.id}</span><StatusPill tone={run.status === 'COMPLETED' ? 'success' : run.status === 'FAILED' ? 'danger' : 'warning'}>{run.status}</StatusPill></div>
            <div className="text-slate-600">{run.started_at || 'Not started'} · {run.finished_at || 'running'}</div>
          </div>) : <EmptyState>No reconciliation runs yet.</EmptyState>}
        </div>
        <div className="panel overflow-hidden">
          <div className="panel-title"><span className="flex items-center gap-2"><Activity size={15} /> Outbox</span><StatusPill tone={pendingEvents ? 'warning' : 'success'}>{pendingEvents} pending</StatusPill></div>
          {events.length ? events.slice(0, 6).map((event) => <div key={event.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-white/5 px-4 py-3 text-xs">
            <span className="truncate text-slate-300">{event.event_type || event.topic || event.id}</span>
            <StatusPill tone={event.status === 'SENT' ? 'success' : event.status === 'FAILED' ? 'danger' : 'warning'}>{event.status}</StatusPill>
          </div>) : <EmptyState>No outbox events.</EmptyState>}
        </div>
      </div>
    </div>
  </ProductShell>
}
