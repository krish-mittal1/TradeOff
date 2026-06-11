'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpRight, PieChart, RefreshCw } from 'lucide-react'
import { ProductShell, StatCard, EmptyState, StatusPill } from '@/components/ProductShell'
import { walletService } from '@/services/walletService'
import { useWebSocket } from '@/providers/WebSocketProvider'

// Market seed prices for local portfolio valuation
const SEED_PRICES = {
  USDT: 1,
  BTC: 68429,
  ETH: 3641,
  BNB: 612,
  SOL: 172,
  XRP: 0.6245,
  ADA: 0.4518,
  DOGE: 0.1682,
  AVAX: 41.28,
  LINK: 18.74,
  DOT: 7.35,
  MATIC: 0.7124,
  LTC: 84.50,
}

const ASSET_COLORS = [
  'from-amber-400 to-orange-500',
  'from-blue-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-purple-400 to-violet-500',
  'from-cyan-400 to-sky-500',
]

function getVirtualHoldings() {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('tradeoff_virtual_balances')
    if (!stored) return []
    const balances = JSON.parse(stored)
    return Object.entries(balances)
      .filter(([, v]) => Number(v) > 0)
      .map(([asset, available]) => {
        const price = SEED_PRICES[asset] || 0
        const total = Number(available)
        const usd = total * price
        return {
          asset,
          available: total.toFixed(6),
          total: total.toFixed(6),
          locked: '0.000000',
          usd_value: usd.toFixed(2),
          price,
        }
      })
      .sort((a, b) => Number(b.usd_value) - Number(a.usd_value))
  } catch {
    return []
  }
}

export default function PortfolioPage() {
  const websocket = useWebSocket()
  const [virtualHoldings, setVirtualHoldings] = useState([])

  const { data, refetch: refetchPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => walletService.getPortfolioSummary(),
    retry: 1,
    refetchInterval: 5000,
  })

  const allocationQuery = useQuery({
    queryKey: ['allocation'],
    queryFn: () => walletService.getAllocation(),
    retry: 1,
    refetchInterval: 5000,
  })
  const { refetch: refetchAllocation } = allocationQuery

  // Load virtual holdings from localStorage on mount
  useEffect(() => {
    setVirtualHoldings(getVirtualHoldings())
  }, [])

  // Merge backend data with virtual balances
  const backendHoldings = data?.holdings || []
  const holdings = backendHoldings.length > 0 ? backendHoldings : virtualHoldings

  const total = (() => {
    if (Number(data?.total_balance_usd || 0) > 0) return Number(data.total_balance_usd)
    return virtualHoldings.reduce((sum, h) => sum + Number(h.usd_value), 0)
  })()

  const backendAllocation = allocationQuery.data?.allocation || []
  const allocation = backendAllocation.length > 0
    ? backendAllocation
    : virtualHoldings.map((h) => ({
        asset: h.asset,
        percent: total ? (Number(h.usd_value) / total) * 100 : 0,
        usd_value: h.usd_value,
      }))

  const holdingsCount = holdings.length

  useEffect(() => {
    if (!websocket) return
    return websocket.subscribe('market.tickers', () => {
      refetchPortfolio()
      refetchAllocation()
      setVirtualHoldings(getVirtualHoldings())
    })
  }, [websocket, refetchPortfolio, refetchAllocation])

  return (
    <ProductShell title="Portfolio" subtitle="Live valuation, allocation, and available balances.">
      {/* Stat cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Total balance"
          value={`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail="Estimated USDT value"
        />
        <StatCard
          label="BTC equivalent"
          value={Number(data?.total_btc || total / 68429).toFixed(8)}
          detail="Portfolio in BTC"
        />
        <StatCard
          label="Assets held"
          value={data?.holdings_count || holdingsCount}
          detail="Non-zero balances"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Holdings table */}
        <div className="panel overflow-hidden">
          <div className="panel-title">
            <span>Holdings</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  refetchPortfolio()
                  refetchAllocation()
                  setVirtualHoldings(getVirtualHoldings())
                }}
                className="text-slate-600 hover:text-slate-300"
                title="Refresh"
              >
                <RefreshCw size={14} />
              </button>
              <StatusPill tone={holdings.length ? 'success' : 'neutral'}>
                {holdings.length ? 'Funded' : 'Empty'}
              </StatusPill>
            </div>
          </div>

          {holdings.length > 0 ? (
            <div>
              <div className="grid grid-cols-5 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-600">
                <span>Asset</span>
                <span className="text-right">Total</span>
                <span className="text-right">Available</span>
                <span className="text-right">USD Value</span>
                <span className="text-right">Allocation</span>
              </div>
              {holdings.map((item, idx) => {
                const pct = total ? Math.min(100, (Number(item.usd_value) / total) * 100) : 0
                const colorClass = ASSET_COLORS[idx % ASSET_COLORS.length]
                return (
                  <div key={item.asset} className="border-b border-white/5 px-4 py-3">
                    <div className="grid grid-cols-5 items-center text-sm">
                      <span className="flex items-center gap-2 font-medium text-white">
                        <span
                          className={`grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br ${colorClass} text-[10px] font-bold text-white/90`}
                        >
                          {item.asset.slice(0, 2)}
                        </span>
                        {item.asset}
                      </span>
                      <span className="text-right font-mono text-slate-300">{Number(item.total).toFixed(6)}</span>
                      <span className="text-right font-mono text-slate-500">{Number(item.available).toFixed(6)}</span>
                      <span className="text-right font-mono font-semibold text-white">
                        ${Number(item.usd_value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-right font-mono text-slate-500">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.04]">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState>
              No holdings yet. Go to <Link href="/wallets" className="text-amber-400 hover:underline">Wallets</Link> to deposit, or start trading on the <Link href="/" className="text-amber-400 hover:underline">main page</Link> with your demo balance.
            </EmptyState>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Allocation chart */}
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Allocation</div>
                <div className="text-xs text-slate-600">Current portfolio split</div>
              </div>
              <PieChart size={18} className="text-amber-400" />
            </div>
            {allocation.length > 0 ? (
              <div className="space-y-3">
                {allocation.slice(0, 8).map((item, idx) => {
                  const colorClass = ASSET_COLORS[idx % ASSET_COLORS.length]
                  return (
                    <div key={item.asset}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full bg-gradient-to-r ${colorClass}`} />
                          {item.asset}
                        </span>
                        <span className="text-slate-500">{Number(item.percent || 0).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-500`}
                          style={{ width: `${Math.min(100, Number(item.percent || 0))}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-500">No assets yet.</div>
            )}
          </div>

          {/* Quick links */}
          <div className="grid gap-3">
            <Link
              href="/wallets"
              className="panel flex items-center gap-3 p-4 text-sm text-white transition hover:border-amber-400/30"
            >
              <ArrowDownToLine size={18} className="text-amber-400" />
              Deposit funds
            </Link>
            <Link
              href="/"
              className="panel flex items-center gap-3 p-4 text-sm text-white transition hover:border-emerald-400/30"
            >
              <ArrowUpRight size={18} className="text-emerald-400" />
              Start trading
            </Link>
          </div>
        </div>
      </div>
    </ProductShell>
  )
}
