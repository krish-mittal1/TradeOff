'use client'

import Link from 'next/link'
import { useEffect, useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpRight, RefreshCw, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { ProductShell, StatCard, EmptyState } from '@/components/ProductShell'
import { walletService } from '@/services/walletService'
import { tradingService } from '@/services/tradingService'
import { useWebSocket } from '@/providers/WebSocketProvider'
import { SEED_PRICES } from '@/lib/marketData'

// ── P&L Sparkline ────────────────────────────────────────────────────────────
function PnLSparkline({ history, height = 120 }) {
  if (history.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs" style={{ height, color: 'var(--t-text3)' }}>
        Collecting data points...
      </div>
    )
  }

  const values = history.map((h) => h.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 280
  const pad = 4

  const first = values[0]
  const last = values[values.length - 1]
  const change = last - first
  const changePct = first > 0 ? ((change / first) * 100) : 0
  const isUp = change >= 0
  const stroke = isUp ? '#10b981' : '#ef4444'
  const fill = isUp ? 'url(#sparkGreen)' : 'url(#sparkRed)'

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (v - min) / range) * (height - pad * 2)
    return `${x},${y}`
  })

  const areaPoints = `${pad},${height - pad} ${points.join(' ')} ${w - pad},${height - pad}`

  const timeLabels = []
  if (history.length >= 2) {
    const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    timeLabels.push({ x: pad, label: fmt(new Date(history[0].time)) })
    timeLabels.push({ x: w - pad, label: fmt(new Date(history[history.length - 1].time)) })
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--t-text)' }}>
            Portfolio Value
          </div>
          <div className="text-xs" style={{ color: 'var(--t-text3)' }}>Live P&amp;L</div>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-1 text-sm font-bold ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {isUp ? '+' : ''}{changePct.toFixed(2)}%
          </div>
          <div className={`text-xs font-mono tabular-nums ${isUp ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
            {isUp ? '+' : ''}${Math.abs(change).toFixed(2)}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id="sparkGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sparkRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={fill} />
        <polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r="3" fill={stroke} />
        <circle cx={points[points.length - 1].split(',')[0]} cy={points[points.length - 1].split(',')[1]} r="6" fill={stroke} opacity="0.2">
          <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0.05;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
        {timeLabels.map((t, i) => (
          <text key={i} x={t.x} y={height - 1} fill="var(--t-text3)" fontSize="9" textAnchor={i === 0 ? 'start' : 'end'} fontFamily="Inter, sans-serif">
            {t.label}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ── Asset color palette ───────────────────────────────────────────────────────
const PALETTE = [
  '#f59e0b', '#3b82f6', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
]

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function DonutChart({ slices, size = 160 }) {
  const r = 56
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const gap = 2 // degrees gap between slices

  const totalPct = slices.reduce((s, x) => s + x.pct, 0) || 1

  let offset = 0
  const paths = slices.map((s, i) => {
    const pct = (s.pct / totalPct) * 100
    const dashLen = (pct / 100) * circumference - gap
    const dashOffset = circumference - offset * circumference / 100 - circumference / 4
    const el = (
      <circle
        key={i}
        r={r}
        cx={cx}
        cy={cy}
        fill="none"
        stroke={s.color}
        strokeWidth={20}
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="butt"
        style={{ transition: 'stroke-dasharray 0.5s ease' }}
      />
    )
    offset += pct
    return el
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle r={r} cx={cx} cy={cy} fill="none" stroke="var(--t-donut-track)" strokeWidth={20} />
      {paths}
    </svg>
  )
}

// ── Virtual holdings from localStorage ───────────────────────────────────────
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
        return {
          asset,
          available: total.toFixed(6),
          total: total.toFixed(6),
          locked: '0.000000',
          usd_value: (total * price).toFixed(2),
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
  const pendingRef = useRef({})
  const flushTimerRef = useRef(null)
  const [valueHistory, setValueHistory] = useState([])

  const { data, refetch: refetchPortfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => walletService.getPortfolioSummary(),
    retry: 1,
    refetchInterval: 15000,
  })

  const ordersQuery = useQuery({
    queryKey: ['open-orders-portfolio'],
    queryFn: () => tradingService.getOrders({ status: 'OPEN', limit: 50 }),
    retry: 1,
    refetchInterval: 8000,
  })

  useEffect(() => { setVirtualHoldings(getVirtualHoldings({})) }, [])

  // Throttle ticker updates — max 1 setState per second
  useEffect(() => {
    if (!websocket) return
    const unsub = websocket.subscribe('market.tickers', (event) => {
      const updates = event.tickers || []
      updates.forEach((t) => {
        const base = t.symbol.replace('USDT', '')
        if (base) pendingRef.current[base] = Number(t.price)
      })
      if (!flushTimerRef.current) {
        flushTimerRef.current = setTimeout(() => {
          flushTimerRef.current = null
          const snapshot = { ...pendingRef.current }
          pendingRef.current = {}
          setLivePrices((prev) => ({ ...prev, ...snapshot }))
        }, 1000)
      }
    })
    return () => { unsub?.(); if (flushTimerRef.current) clearTimeout(flushTimerRef.current) }
  }, [websocket])

  useEffect(() => {
    if (Object.keys(livePrices).length > 0) {
      setVirtualHoldings(getVirtualHoldings(livePrices))
    }
  }, [livePrices])

  const backendHoldings = data?.holdings || []
  const holdings = backendHoldings.length > 0 ? backendHoldings : virtualHoldings

  const total = useMemo(() => {
    if (Number(data?.total_balance_usd || 0) > 0) return Number(data.total_balance_usd)
    return virtualHoldings.reduce((s, h) => s + Number(h.usd_value), 0)
  }, [data, virtualHoldings])

  // Available cash = the USDT you can still spend (USDT ≈ US dollars).
  const cashUsdt = useMemo(() => {
    const u = holdings.find((h) => h.asset === 'USDT')
    return u ? Number(u.available ?? u.total) : 0
  }, [holdings])

  // Allocation slices for donut
  const allocationSlices = useMemo(() => {
    const source = holdings.length > 0
      ? holdings.map((h, i) => ({
          asset: h.asset,
          pct: total > 0 ? (Number(h.usd_value || 0) / total) * 100 : 0,
          color: PALETTE[i % PALETTE.length],
        }))
      : []
    return source.filter((s) => s.pct > 0.01)
  }, [holdings, total])

  // Record portfolio value snapshots for the P&L sparkline
  useEffect(() => {
    if (total <= 0) return
    setValueHistory((prev) => {
      const now = Date.now()
      if (prev.length > 0 && now - prev[prev.length - 1].time < 3000) return prev
      const next = [...prev, { time: now, value: total }]
      return next.length > 120 ? next.slice(-120) : next
    })
  }, [total, livePrices])

  // Open orders
  const openOrders = Array.isArray(ordersQuery.data) ? ordersQuery.data : (ordersQuery.data?.orders || [])

  function refresh() {
    refetchPortfolio()
    ordersQuery.refetch()
    setVirtualHoldings(getVirtualHoldings(livePrices))
  }

  return (
    <ProductShell title="Portfolio" subtitle="Everything you own, valued in US dollars.">
      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          label="Total value"
          value={`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail="Cash + coins, in US dollars"
        />
        <StatCard
          label="Available cash"
          value={`$${cashUsdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail="USDT ready to spend"
        />
        <StatCard
          label="Coins held"
          value={data?.holdings_count || holdings.length}
          detail="Different assets you own"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Holdings table */}
          <div className="panel overflow-hidden">
            <div className="panel-title">
              <span>Holdings</span>
              <div className="flex items-center gap-2">
                <button onClick={refresh} className="text-slate-600 hover:text-slate-300 transition" title="Refresh">
                  <RefreshCw size={13} />
                </button>
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${holdings.length ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>
                  {holdings.length ? 'Funded' : 'Empty'}
                </span>
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
                  const liveP = livePrices[item.asset]
                  const displayUsd = liveP ? Number(item.total) * liveP : Number(item.usd_value)
                  const pct = total > 0 ? Math.min(100, (displayUsd / total) * 100) : 0
                  const color = PALETTE[idx % PALETTE.length]
                  const locked = Number(item.locked || 0)

                  return (
                    <div key={item.asset} className="border-b border-white/[0.04] px-4 py-3 hover:bg-white/[0.02] transition">
                      <div className="grid grid-cols-5 items-center gap-2 text-sm">
                        {/* Asset */}
                        <span className="flex items-center gap-2 font-medium text-white">
                          <span
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                            style={{ background: color }}
                          >
                            {item.asset.slice(0, 2)}
                          </span>
                          <span>
                            {item.asset}
                            {locked > 0 && (
                              <span className="ml-1.5 text-[9px] text-amber-400/70">({locked.toFixed(4)} locked)</span>
                            )}
                          </span>
                        </span>
                        <span className="text-right font-mono text-slate-300 tabular-nums">{Number(item.total).toFixed(6)}</span>
                        <span className="text-right font-mono text-slate-500 tabular-nums">{Number(item.available).toFixed(6)}</span>
                        <span className="text-right font-mono font-semibold text-white tabular-nums">
                          ${displayUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-right font-mono text-slate-500 tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState>
                No holdings yet.{' '}
                <Link href="/wallets" className="text-amber-400 hover:underline">Deposit funds</Link>
                {' '}or{' '}
                <Link href="/" className="text-amber-400 hover:underline">start trading</Link>.
              </EmptyState>
            )}
          </div>

          {/* Open orders */}
          <div className="panel overflow-hidden">
            <div className="panel-title">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-amber-400" />
                Open Orders
                {openOrders.length > 0 && (
                  <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                    {openOrders.length}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-600">Limit orders waiting to fill</span>
            </div>

            {openOrders.length > 0 ? (
              <div>
                <div className="grid grid-cols-5 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-600">
                  <span>Pair</span>
                  <span>Side</span>
                  <span className="text-right">Limit Price</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Status</span>
                </div>
                {openOrders.slice(0, 10).map((order) => (
                  <div key={order.id} className="grid grid-cols-5 items-center border-b border-white/[0.04] px-4 py-3 text-sm hover:bg-white/[0.02] transition">
                    <span className="font-mono text-slate-300 text-xs">{order.pair || order.trading_pair}</span>
                    <span className={`text-xs font-semibold ${order.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {order.side}
                    </span>
                    <span className="text-right font-mono text-xs text-white tabular-nums">
                      {Number(order.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-right font-mono text-xs text-slate-400 tabular-nums">
                      {Number(order.quantity || order.qty || 0).toFixed(6)}
                    </span>
                    <span className="text-right">
                      <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        {order.status || 'OPEN'}
                      </span>
                    </span>
                  </div>
                ))}
                {openOrders.length > 10 && (
                  <div className="px-4 py-2 text-center text-xs text-slate-600">
                    +{openOrders.length - 10} more — <Link href="/" className="text-amber-400 hover:underline">view all</Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-600">
                No open orders. <Link href="/" className="text-amber-400 hover:underline">Place a trade →</Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* P&L Sparkline */}
          <div className="panel p-5 transition-colors duration-200 hover:border-white/[0.1]">
            <PnLSparkline history={valueHistory} />
          </div>

          {/* Donut chart + legend */}
          <div className="panel p-5 transition-colors duration-200 hover:border-white/[0.1]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold tracking-tight text-white">Allocation</div>
                <div className="text-xs text-slate-600">Portfolio split</div>
              </div>
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-amber-400/10">
                <TrendingUp size={14} className="text-amber-400" />
              </div>
            </div>

            {allocationSlices.length > 0 ? (
              <>
                {/* Donut */}
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <DonutChart slices={allocationSlices} size={160} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs text-slate-500">Total</span>
                      <span className="text-sm font-bold text-white">
                        ${(total / 1000).toFixed(1)}k
                      </span>
                    </div>
                  </div>
                </div>
                {/* Legend */}
                <div className="space-y-2">
                  {allocationSlices.map((s, i) => (
                    <div key={s.asset} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                        <span className="text-slate-300">{s.asset}</span>
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">{s.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex justify-center py-4 text-sm text-slate-600">No assets yet.</div>
            )}
          </div>

          {/* Quick links */}
          <div className="flex flex-col gap-3">
            <Link href="/wallets" className="panel flex items-center gap-3 p-4 text-sm font-medium text-white transition-all duration-200 hover:border-amber-400/20 hover:bg-amber-400/[0.02] group">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-400/10 transition-colors group-hover:bg-amber-400/15">
                <ArrowDownToLine size={15} className="text-amber-400" />
              </div>
              Deposit funds
            </Link>
            <Link href="/" className="panel flex items-center gap-3 p-4 text-sm font-medium text-white transition-all duration-200 hover:border-emerald-400/20 hover:bg-emerald-400/[0.02] group">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-400/10 transition-colors group-hover:bg-emerald-400/15">
                <ArrowUpRight size={15} className="text-emerald-400" />
              </div>
              Start trading
            </Link>
          </div>
        </div>
      </div>
    </ProductShell>
  )
}
