'use client'

import { useQuery } from '@tanstack/react-query'
import { ProductShell, EmptyState, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function AdminTradesPage() {
  // Admins can see all recent trades via the public market endpoint
  const { data, error } = useQuery({
    queryKey: ['admin-recent-trades'],
    queryFn: () => apiClient.get('/trades'),
    retry: 1,
  })
  const trades = data?.trades || []

  return (
    <ProductShell title="Trade History" subtitle="Exchange-wide executed trades.">
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
