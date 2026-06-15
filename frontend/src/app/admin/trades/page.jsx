'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ProductShell, EmptyState, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function AdminTradesPage() {
  // Admins can see all recent trades via the admin endpoints
  const { data, error } = useQuery({
    queryKey: ['admin-recent-trades'],
    queryFn: () => apiClient.get('/admin/trades'),
    retry: 1,
  })
  const trades = data?.trades || []

  return (
    <ProductShell title="Trade History" subtitle="Exchange-wide executed trades.">
      <div className="mb-6 flex gap-4 border-b border-white/5 pb-3 text-xs">
        <Link href="/admin" className="text-slate-500 hover:text-slate-300">Dashboard</Link>
        <Link href="/admin/users" className="text-slate-500 hover:text-slate-300">Manage Users</Link>
        <Link href="/admin/assets" className="text-slate-500 hover:text-slate-300">Trading Pairs</Link>
        <Link href="/admin/trades" className="text-amber-400 font-semibold border-b border-amber-400 pb-3 -mb-3.5">Trade History</Link>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-title">
          Recent Trades
          <StatusPill>{trades.length} shown</StatusPill>
        </div>
        <div className="grid grid-cols-5 border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-slate-600">
          <span>Pair</span>
          <span>Price</span>
          <span>Quantity</span>
          <span>Role</span>
          <span>Time</span>
        </div>
        {error ? (
          <EmptyState>Could not load trades.</EmptyState>
        ) : trades.length ? (
          trades.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-5 border-b border-white/5 px-4 py-3 text-xs font-mono"
            >
              <span className="text-white">{t.pair}</span>
              <span className="text-slate-300">{t.price}</span>
              <span className="text-slate-300">{t.quantity}</span>
              <span className={t.role === 'taker' ? 'text-amber-400' : 'text-slate-500'}>{t.role}</span>
              <span className="text-slate-600">
                {new Date(t.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        ) : (
          <EmptyState>No trades executed yet. Run the demo bootstrap and place some orders.</EmptyState>
        )}
      </div>
    </ProductShell>
  )
}
