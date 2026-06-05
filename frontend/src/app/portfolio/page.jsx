'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpRight, PieChart } from 'lucide-react'
import { ProductShell, StatCard, EmptyState, StatusPill } from '@/components/ProductShell'
import { walletService } from '@/services/walletService'

export default function PortfolioPage() {
  const { data } = useQuery({ queryKey: ['portfolio'], queryFn: () => walletService.getPortfolioSummary(), retry: 1 })
  const allocationQuery = useQuery({ queryKey: ['allocation'], queryFn: () => walletService.getAllocation(), retry: 1 })
  const holdings = data?.holdings || []
  const total = Number(data?.total_balance_usd || 0)
  const allocation = allocationQuery.data?.allocation || holdings.map((item) => ({
    asset: item.asset,
    percent: total ? (Number(item.usd_value || 0) / total) * 100 : 0,
    usd_value: item.usd_value,
  }))

  return <ProductShell title="Portfolio" subtitle="Live valuation, allocation, and available balances.">
    <div className="grid gap-3 md:grid-cols-3">
      <StatCard label="Total balance" value={`$${total.toLocaleString()}`} detail="Estimated USDT value" />
      <StatCard label="BTC value" value={Number(data?.total_btc || 0).toFixed(8)} detail="Portfolio equivalent" />
      <StatCard label="Assets held" value={data?.holdings_count || 0} detail="Non-zero balances" />
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="panel overflow-hidden">
        <div className="panel-title">
          <span>Holdings</span>
          <StatusPill tone={holdings.length ? 'success' : 'neutral'}>{holdings.length ? 'Funded' : 'Empty'}</StatusPill>
        </div>
        {holdings.length ? holdings.map((item) => {
          const percent = total ? Math.min(100, (Number(item.usd_value || 0) / total) * 100) : 0
          return <div key={item.asset} className="asset-row grid grid-cols-4 border-b border-white/5 px-4 py-4 text-sm">
            <span className="font-medium text-white">{item.asset}<span className="ml-2 text-xs text-slate-600">{percent.toFixed(1)}%</span></span>
            <span className="text-right font-mono">{item.total}</span>
            <span className="text-right font-mono text-slate-500">{item.available} available</span>
            <span className="text-right font-semibold text-white">${Number(item.usd_value).toLocaleString()}</span>
            <span className="col-span-4 mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.04]"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} /></span>
          </div>
        }) : <EmptyState>Log in and fund a wallet to see portfolio holdings.</EmptyState>}
      </div>
      <div className="space-y-4">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div><div className="text-sm font-semibold text-white">Allocation</div><div className="text-xs text-slate-600">Current portfolio split</div></div>
            <PieChart size={18} className="text-amber-400" />
          </div>
          {allocation.length ? allocation.slice(0, 6).map((item) => <div key={item.asset} className="mb-3">
            <div className="mb-1 flex justify-between text-xs"><span>{item.asset}</span><span className="text-slate-500">{Number(item.percent || 0).toFixed(1)}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${Math.min(100, Number(item.percent || 0))}%` }} /></div>
          </div>) : <div className="text-sm text-slate-500">No allocation yet.</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Link href="/wallets" className="panel flex items-center gap-3 p-4 text-sm text-white hover:border-amber-400/30"><ArrowDownToLine size={18} className="text-amber-400" /> Deposit funds</Link>
          <Link href="/" className="panel flex items-center gap-3 p-4 text-sm text-white hover:border-emerald-400/30"><ArrowUpRight size={18} className="text-emerald-400" /> Start trading</Link>
        </div>
      </div>
    </div>
  </ProductShell>
}
