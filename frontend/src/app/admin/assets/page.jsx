'use client'

import { useQuery } from '@tanstack/react-query'
import { ProductShell, EmptyState, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function AdminAssetsPage() {
  const { data, error } = useQuery({
    queryKey: ['market-pairs'],
    queryFn: () => apiClient.get('/market/pairs'),
    retry: 1,
  })
  const pairs = data || []

  return (
    <ProductShell title="Assets & Pairs" subtitle="All listed trading pairs on this exchange.">
      <div className="panel overflow-hidden">
        <div className="panel-title">
          Trading Pairs
          <StatusPill>{pairs.length} active</StatusPill>
        </div>
        <div className="grid grid-cols-6 border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-slate-600">
          <span>Symbol</span>
          <span>Base</span>
          <span>Quote</span>
          <span>Min qty</span>
          <span>Maker fee</span>
          <span>Status</span>
        </div>
        {error ? (
          <EmptyState>Could not load trading pairs.</EmptyState>
        ) : pairs.length ? (
          pairs.map((p) => (
            <div
              key={p.symbol}
              className="grid grid-cols-6 border-b border-white/5 px-4 py-3 text-xs"
            >
              <span className="font-medium text-white">{p.symbol}</span>
              <span className="text-slate-300">{p.base_asset}</span>
              <span className="text-slate-300">{p.quote_asset}</span>
              <span className="font-mono text-slate-400">{p.min_qty}</span>
              <span className="font-mono text-slate-400">{(Number(p.maker_fee) * 100).toFixed(2)}%</span>
              <StatusPill tone={p.is_active ? 'success' : 'warning'}>
                {p.is_active ? 'Active' : 'Inactive'}
              </StatusPill>
            </div>
          ))
        ) : (
          <EmptyState>No trading pairs found. Run the demo bootstrap to seed assets.</EmptyState>
        )}
      </div>
    </ProductShell>
  )
}
