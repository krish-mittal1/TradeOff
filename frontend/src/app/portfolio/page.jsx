'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpRight, PieChart, RefreshCw } from 'lucide-react'
import { ProductShell, StatCard, EmptyState, StatusPill } from '@/components/ProductShell'
import { walletService } from '@/services/walletService'
import { useWebSocket } from '@/providers/WebSocketProvider'
import { SEED_PRICES } from '@/lib/marketData'

const ASSET_COLORS = [
  'from-amber-400 to-orange-500',
  'from-blue-400 to-indigo-500',
  'from-emerald-400 to-teal-500',
  'from-rose-400 to-pink-500',
  'from-purple-400 to-violet-500',
  'from-cyan-400 to-sky-500',
]

function getVirtualHoldings(overridePrices = {}) {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('tradeoff_virtual_balances')
    if (!stored) return []
    const balances = JSON.parse(stored)
    return Object.entries(balances)
      .filter(([, v]) => Number(v) > 0)
      .map(([asset, available]) => {
        const price = overridePrices[asset] ?? SEED_PRICES[asset] ?? 0
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
  const [livePrices, setLivePrices] = useState({})

  const { data, refetch: refetchPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => walletService.getPortfolioSummary(),
    retry: 1,
    refetchInterval: 10000,
  })

  const allocationQuery = useQuery({
    queryKey: ['allocation'],
    queryFn: () => walletService.getAllocation(),
    retry: 1,
    refetchInterval: 10000,
  })
  const { refetch: refetchAllocation } = allocationQuery

  // Load virtual holdings whenever live prices update
  const refreshVirtual = () => setVirtualHoldings(getVirtualHoldings(livePrices))

  useEffect(() => {
    setVirtualHoldings(getVirtualHoldings({}))
  }, [])

  useEffect(() => {
    if (Object.keys(livePrices).length > 0) {
      setVirtualHoldings(getVirtualHoldings(livePrices))
    }
  }, [livePrices])

  // Subscribe to live ticker updates
  useEffect(() => {
    if (!websocket) return
    return websocket.subscribe('market.tickers', (event) => {
      const updates = event.tickers || []
      if (updates.length) {
        setLivePrices((prev) => {
          const next = { ...prev }
          updates.forEach((t) => {
            const base = t.symbol.replace('USDT', '')
            if (base) next[base] = Number(t.price)
          })
          return next
        })
      }
      refetchPortfolio()
      refetchAllocation()
    })
  }, [websocket, refetchPortfolio, refetchAllocation])

  // Prefer backend holdings; fall back to virtual
  const backendHoldings = data?.holdings || []
  const holdings = backendHoldings.length > 0 ? backendHoldings : virtualHoldings

  // Effective prices: live > SEED
  const effectivePrices = useMemo(() => ({ ...SEED_PRICES, ...livePrices }), [livePrices])

  const total = useMemo(() => {
    if (Number(data?.total_balance_usd || 0) > 0) return Number(data.total_balance_usd)
    return virtualHoldings.reduce((sum, h) => sum + Number(h.usd_value), 0)
  }, [data, virtualHoldings])

  const backendAllocation = allocationQuery.data?.allocation || []
  const allocation = backendAllocation.length > 0
    ? backendAllocation
    : virtualHoldings.map((h) => ({
        asset: h.asset,
        percent: total ? (Number(h.usd_value) / total) * 100 : 0,
        usd_value: h.usd_value,
      }))

  const btcPrice = effectivePrices.BTC || 68429
  const btcEquivalent = total > 0 ? (total / btcPrice).toFixed(8) : (Number(data?.total_btc || 0)).toFixed(8)

  function refresh() {
    refetchPortfolio()
    refetchAllocation()
    refreshVirtual()
  }

  return (
    <ProductShell title="Portfolio" subtitle="Live valuation, allocation, and available balances.">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Total balance"
          value={`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail="Estimated USDT value"
        />
        <StatCard
          label="BTC equivalent"
          value={btcEquivalent}
          detail={`@ $${btcPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
        />
        <StatCard
          label="Assets held"
          value={data?.holdings_count || holdings.length}
          detail="Non-zero balances"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Holdings table */}
        <div className="panel overflow-hidden">
          <div className="panel-title">
            <span>Holdings</span>
            <div className="flex items-center gap-2">
              <button onClick={refresh} className="text-slate-600 hover:text-slate-300" title="Refresh">
                <RefreshCw size={13} />
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
                const usdVal = Number(item.usd_value)
                const pct = total > 0 ? Math.min(100, (usdVal / total) * 100) : 0
                const colorClass = ASSET_COLORS[idx % ASSET_COLORS.length]
                // Recalculate usd_value with live prices for virtual holdings
                const livePrice = livePrices[item.asset]
                const displayUsd = livePrice
                  ? (Number(item.total) * livePrice)
                  : usdVal

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
                      <span className="text-right font-mono text-slate-300 tabular-nums">{Number(item.total).toFixed(6)}</span>
                      <span className="text-right font-mono text-slate-500 tabular-nums">{Number(item.available).toFixed(6)}</span>
                      <span className="text-right font-mono font-semibold text-white tabular-nums">
                        ${displayUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-right font-mono text-slate-500 tabular-nums">{pct.toFixed(1)}%</span>
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
              No holdings yet.{' '}
              <Link href="/wallets" className="text-amber-400 hover:underline">Deposit funds</Link>
              {' '}or start trading on the{' '}
              <Link href="/" className="text-amber-400 hover:underline">main page</Link>
              {' '}with your demo balance.
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
                <div className="text-xs text-slate-600">Portfolio split</div>
              </div>
              <PieChart size={16} className="text-amber-400" />
            </div>
            {allocation.length > 0 ? (
              <div className="space-y-3">
                {allocation.slice(0, 8).map((item, idx) => {
                  const colorClass = ASSET_COLORS[idx % ASSET_COLORS.length]
                  const pct = Number(item.percent || 0)
                  return (
                    <div key={item.asset}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full bg-gradient-to-r ${colorClass}`} />
                          {item.asset}
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${colorClass} transition-all duration-500`}
                          style={{ width: `${Math.min(100, pct)}%` }}
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
            <Link href="/wallets" className="panel flex items-center gap-3 p-4 text-sm text-white transition hover:border-amber-400/30">
              <ArrowDownToLine size={16} className="text-amber-400" />
              Deposit funds
            </Link>
            <Link href="/" className="panel flex items-center gap-3 p-4 text-sm text-white transition hover:border-emerald-400/30">
              <ArrowUpRight size={16} className="text-emerald-400" />
              Start trading
            </Link>
          </div>
        </div>
      </div>
    </ProductShell>
  )
}
