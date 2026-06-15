'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ArrowDown, ArrowUp, BarChart3, Bell, BookOpen, ChevronDown,
  CircleDollarSign, LayoutDashboard, LogOut, Menu, Moon, Search, Settings,
  ShieldCheck, Star, Sun, Wallet, X,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { tradingService } from '@/services/tradingService'
import { walletService } from '@/services/walletService'
import { useAuth } from '@/providers/AuthProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useWebSocket } from '@/providers/WebSocketProvider'
import { CandlestickChart } from '@/components/trading/CandlestickChart'
import { MARKET_SEED, DEMO_BALANCES } from '@/lib/marketData'

// ─── Order book seed helpers ───────────────────────────────────────────────────
function seedBook(mid, side) {
  return Array.from({ length: 12 }, (_, i) => {
    const offset = (i + 1) * (mid > 1000 ? mid * 0.00008 : mid > 10 ? mid * 0.0003 : mid * 0.001)
    const price = side === 'ask' ? mid + offset : mid - offset
    const amount = ((i * 7 + 3) % 19 + 0.14) / (mid > 1000 ? 10 : mid > 10 ? 1 : 100)
    return { price, amount, total: amount * price, depth: 22 + ((i * 17) % 72) }
  })
}

function seedTrades(mid, symbol) {
  return Array.from({ length: 20 }, (_, i) => ({
    id: `${symbol}-${i}`,
    price: mid + ((i % 5) - 2) * mid * 0.0002,
    amount: ((i * 13) % 47 + 2) / (mid > 1000 ? 1000 : mid > 10 ? 10 : 1),
    side: i % 3 === 0 ? 'sell' : 'buy',
    time: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes() - Math.floor(i / 2)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
  }))
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatPrice(value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0.00'
  return n >= 100
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function stepDecimals(stepSize) {
  const [, dec = ''] = String(stepSize || '0.000001').split('.')
  return dec.replace(/0+$/, '').length
}

function floorToStep(value, stepSize = '0.000001') {
  const n = Number(value || 0)
  const step = Number(stepSize || 0.000001)
  if (!Number.isFinite(n) || n <= 0 || !Number.isFinite(step) || step <= 0) return ''
  return (Math.floor((n + Number.EPSILON) / step) * step).toFixed(stepDecimals(stepSize))
}

// ─── Simulate live price ticks ─────────────────────────────────────────────────
function useLivePriceTick(basePrice, symbol, interval = 2500) {
  const [price, setPrice] = useState(basePrice)
  const stateRef = useRef({ price: basePrice, symbol })

  // Reset immediately when pair changes
  useEffect(() => {
    stateRef.current = { price: basePrice, symbol }
    setPrice(basePrice)
  }, [basePrice, symbol])

  useEffect(() => {
    const id = setInterval(() => {
      const volatility = stateRef.current.price * 0.0006
      const change = (Math.random() - 0.5) * volatility
      stateRef.current.price = Math.max(stateRef.current.price * 0.95, stateRef.current.price + change)
      setPrice(stateRef.current.price)
    }, interval)
    return () => clearInterval(id)
  }, [symbol, interval]) // restart tick simulation on coin switch

  return price
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ onAuthOpen, markets = [], onSelectMarket }) {
  const { user, logout } = useAuth()
  const themeCtx = useTheme()
  const theme = themeCtx?.theme ?? 'dark'
  const toggleTheme = themeCtx?.toggleTheme ?? (() => {})
  const websocket = useWebSocket()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef(null)

  const searchResults = searchQuery.length > 0
    ? markets.filter((m) =>
        m.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.base?.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : []

  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const navItems = [
    ['Markets', '/market'],
    ['Trade', '/'],
    ['Portfolio', '/portfolio'],
    ['Wallets', '/wallets'],
    ['Copy Trading', '/copy-trading'],
    ['AI', '/assistant'],
  ]

  return (
    <header className="exchange-header sticky top-0 z-50 border-b border-white/5 bg-[#090c12]/95 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-6 px-4 lg:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#0b0e14] shadow-lg shadow-amber-500/20">
            <BarChart3 size={18} strokeWidth={2.8} />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">TradeOff</span>
        </div>

        <nav className="hidden items-center gap-0.5 text-sm text-slate-400 md:flex">
          {navItems.map(([label, href], i) => (
            <Link
              href={href}
              key={label}
              className={`rounded-lg px-3 py-1.5 transition hover:bg-white/5 hover:text-white ${i === 1 ? 'bg-white/5 text-white' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="relative ml-auto hidden w-full max-w-[280px] lg:block">
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2 focus-within:border-amber-400/30 transition">
            <Search size={15} className="shrink-0 text-slate-500" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search markets"
              className="w-full border-0 bg-transparent p-0 text-xs text-slate-200 placeholder:text-slate-500 focus:ring-0"
            />
            {searchQuery
              ? <button onMouseDown={() => { setSearchQuery(''); setSearchOpen(false) }}><X size={13} className="text-slate-600 hover:text-slate-300" /></button>
              : <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-600">/</kbd>}
          </div>
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#10141d] shadow-2xl">
              {searchResults.map((m) => (
                <button
                  key={m.symbol}
                  onMouseDown={() => { onSelectMarket?.(m); setSearchQuery(''); setSearchOpen(false) }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm transition hover:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-white">{m.base}</span>
                    <span className="text-slate-500">/USDT</span>
                  </span>
                  <div className="text-right">
                    <div className="font-mono text-xs text-slate-300">{formatPrice(m.price)}</div>
                    <div className={`font-mono text-[10px] ${m.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.change >= 0 ? '+' : ''}{Number(m.change).toFixed(2)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <span
            className={`hidden rounded-full border px-2 py-0.5 text-[10px] sm:inline-flex ${
              websocket?.connected
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.035] text-slate-500'
            }`}
          >
            {websocket?.connected ? '● Live' : '○ Offline'}
          </span>
          <button onClick={toggleTheme} className="icon-button" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link href="/notifications" className="icon-button" aria-label="Notifications">
            <Bell size={16} />
          </Link>
          {user ? (
            <button
              onClick={logout}
              className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:text-white sm:flex"
            >
              <LogOut size={13} /> Log out
            </button>
          ) : (
            <>
              <button onClick={onAuthOpen} className="hidden rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:text-white sm:block">
                Log in
              </button>
              <button
                onClick={onAuthOpen}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#0b0e14] hover:bg-amber-300 transition"
              >
                Get started
              </button>
            </>
          )}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="icon-button md:hidden" aria-label="Menu">
            <Menu size={17} />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="mobile-menu md:hidden border-t border-white/5 bg-[#090c12] px-4 py-3 space-y-1">
          {navItems.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              onClick={() => setMobileOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            >
              {label}
            </Link>
          ))}
          {user && (
            <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-400 hover:bg-white/5">
              Log out
            </button>
          )}
        </nav>
      )}
    </header>
  )
}

// ─── Side Rail ────────────────────────────────────────────────────────────────
function SideRail() {
  const items = [
    [LayoutDashboard, '/portfolio', 'Portfolio'],
    [Activity, '/', 'Trade'],
    [BookOpen, '/market', 'Markets'],
    [Wallet, '/wallets', 'Wallets'],
    [CircleDollarSign, '/copy-trading', 'Copy'],
  ]
  return (
    <aside className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r border-white/5 bg-[#090c12] py-3 lg:flex">
      {items.map(([Icon, href, label], i) => (
        <Link
          href={href}
          key={href + i}
          title={label}
          className={`grid h-9 w-9 place-items-center rounded-lg transition ${
            i === 1 ? 'bg-amber-400/10 text-amber-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Icon size={17} />
        </Link>
      ))}
      <Link href="/profile" title="Settings" className="mt-auto grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200">
        <Settings size={17} />
      </Link>
    </aside>
  )
}

// ─── Market Selector ──────────────────────────────────────────────────────────
function MarketSelector({ markets, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const filtered = markets.filter((m) => m.symbol.toLowerCase().includes(query.toLowerCase()))

  return (
    <section className="panel market-selector flex flex-col overflow-hidden h-full">
      <div className="panel-title">
        <span>Markets</span>
        <Star size={13} className="text-slate-600" />
      </div>
      <div className="mx-2 mb-1.5 flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-1.5 text-xs text-slate-500">
        <Search size={12} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-0 bg-transparent p-0 text-[11px] text-slate-200 placeholder:text-slate-600 focus:ring-0"
          placeholder="Search pair"
        />
      </div>
      <div className="grid grid-cols-[1fr_1fr_0.7fr] px-2.5 py-1 text-[9px] uppercase tracking-wider text-slate-600">
        <span>Pair</span><span className="text-right">Price</span><span className="text-right">24h</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((m) => (
          <button
            key={m.symbol}
            onClick={() => onSelect(m)}
            className={`grid w-full grid-cols-[1fr_1fr_0.7fr] items-center px-2.5 py-1.5 text-[11px] transition hover:bg-white/[0.035] ${
              selected.symbol === m.symbol ? 'bg-white/[0.06]' : ''
            }`}
          >
            <span className="flex items-center gap-1.5 text-left font-medium text-slate-200">
              <Star
                size={10}
                className={selected.symbol === m.symbol ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
              />
              {m.base}<span className="text-slate-600">/USDT</span>
            </span>
            <span className="text-right font-mono text-slate-300">{formatPrice(m.price)}</span>
            <span className={`text-right font-mono text-[10px] ${m.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {m.change >= 0 ? '+' : ''}{Number(m.change).toFixed(2)}%
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Ticker Strip ─────────────────────────────────────────────────────────────
function TickerStrip({ market, livePrice }) {
  const displayPrice = livePrice || market.price
  const isUp = market.change >= 0
  // Derive 24h high/low from live price (more realistic)
  const high24h = market.high || displayPrice * 1.032
  const low24h = market.low || displayPrice * 0.958

  return (
    <section className="panel ticker-strip flex min-h-[76px] shrink-0 items-center gap-5 overflow-x-auto px-4 py-2.5">
      <div className="min-w-fit">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-400/10 text-[10px] text-amber-400">
            {market.base?.[0]}
          </span>
          {market.base}/USDT <ChevronDown size={13} className="text-slate-600" />
        </div>
        <div className="mt-0.5 text-[10px] text-slate-600">Spot market</div>
      </div>
      <div className="min-w-fit">
        <div className={`font-mono text-lg font-bold tabular-nums transition-colors ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
          {formatPrice(displayPrice)}
        </div>
        <div className="text-[10px] text-slate-600">${formatPrice(displayPrice)}</div>
      </div>
      {[
        ['24h Change', `${market.change >= 0 ? '+' : ''}${Number(market.change).toFixed(2)}%`, isUp ? 'text-emerald-400' : 'text-rose-400'],
        ['24h High', formatPrice(high24h), 'text-slate-300'],
        ['24h Low', formatPrice(low24h), 'text-slate-300'],
        [`24h Volume (${market.base})`, market.volume, 'text-slate-300'],
      ].map(([label, value, color]) => (
        <div key={label} className="min-w-fit">
          <div className="text-[10px] text-slate-600">{label}</div>
          <div className={`mt-0.5 font-mono text-[11px] ${color}`}>{value}</div>
        </div>
      ))}
    </section>
  )
}

// ─── Price Chart (wrapper for CandlestickChart) ───────────────────────────────
const TAB_INTERVALS = { '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d' }

function PriceChart({ market, candles, interval = '1m', onIntervalChange }) {
  const tabs = Object.keys(TAB_INTERVALS)
  const activeTab = Object.entries(TAB_INTERVALS).find(([, v]) => v === interval)?.[0] ?? '1m'
  return (
    <section className="panel price-chart flex flex-col overflow-hidden h-full">
      <div className="panel-title shrink-0">
        <div className="flex items-center gap-3">
          <span>Chart</span>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => onIntervalChange?.(TAB_INTERVALS[t])}
              className={`text-[10px] transition ${
                t === activeTab ? 'text-amber-400 font-semibold' : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <BarChart3 size={13} />
          <span>Candles</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 px-1 pb-1">
        <CandlestickChart market={market} candles={candles} />
      </div>
    </section>
  )
}

// ─── Order Book ───────────────────────────────────────────────────────────────
function OrderBook({ market, depth, livePrice }) {
  const mid = livePrice || market.price

  const bids = useMemo(() => {
    if (!depth?.bids?.length) return seedBook(mid, 'bid')
    return depth.bids.slice(0, 12).map(([p, q]) => ({ price: +p, amount: +q, total: +p * +q }))
  }, [depth, mid])

  const asks = useMemo(() => {
    if (!depth?.asks?.length) return seedBook(mid, 'ask').reverse()
    return depth.asks.slice(0, 12).map(([p, q]) => ({ price: +p, amount: +q, total: +p * +q })).reverse()
  }, [depth, mid])

  const withDepth = (list) => {
    let cum = 0
    const mapped = list.map((x) => { cum += x.amount; return { ...x, cumulative: cum } })
    const total = cum || 1
    return mapped.map((x) => ({ ...x, depth: Math.min(100, (x.cumulative / total) * 100) }))
  }

  const asksWithDepth = withDepth([...asks].reverse()).reverse()
  const bidsWithDepth = withDepth(bids)

  const row = (item, side, i) => (
    <div key={`${side}-${i}`} className="relative grid grid-cols-3 px-3 py-[3px] font-mono text-[11px] hover:bg-white/[0.02]">
      <span className={`relative z-10 tabular-nums ${side === 'ask' ? 'text-rose-400' : 'text-emerald-400'}`}>{formatPrice(item.price)}</span>
      <span className="relative z-10 text-right text-slate-400 tabular-nums">{item.amount.toFixed(5)}</span>
      <span className="relative z-10 text-right text-slate-600 tabular-nums">{item.total.toFixed(2)}</span>
      <span
        className={`absolute inset-y-0 right-0 ${side === 'ask' ? 'bg-rose-500/[0.07]' : 'bg-emerald-500/[0.07]'}`}
        style={{ width: `${item.depth}%` }}
      />
    </div>
  )

  return (
    <section className="panel order-book flex flex-col overflow-hidden h-full">
      <div className="panel-title shrink-0">
        <span>Order Book</span>
        <span className="text-[10px] text-slate-600">0.01 USDT</span>
      </div>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600 shrink-0">
        <span>Price (USDT)</span>
        <span className="text-right">Amount ({market.base})</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div>{asksWithDepth.map((x, i) => row(x, 'ask', i))}</div>
        <div className="flex items-center gap-2 border-y border-white/5 px-3 py-1.5 font-mono text-xs font-bold shrink-0">
          {market.change >= 0
            ? <ArrowUp size={13} className="text-emerald-400" />
            : <ArrowDown size={13} className="text-rose-400" />}
          <span className={`tabular-nums ${market.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatPrice(mid)}</span>
          <span className="ml-auto text-[10px] font-normal text-slate-600">Spread 0.01%</span>
        </div>
        <div>{bidsWithDepth.map((x, i) => row(x, 'bid', i))}</div>
      </div>
    </section>
  )
}

// ─── Recent Trades ────────────────────────────────────────────────────────────
function RecentTrades({ market, tradesList, livePrice }) {
  const mid = livePrice || market.price
  // Only regenerate seeded trades on pair change (live price updates handled by tradesList)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seeded = useMemo(() => seedTrades(market.price, market.symbol), [market.symbol])
  const trades = tradesList?.length ? tradesList : seeded

  return (
    <section className="panel recent-trades flex flex-col overflow-hidden h-full">
      <div className="panel-title shrink-0">
        <span>Market Trades</span>
        <Activity size={13} className="text-slate-600" />
      </div>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600 shrink-0">
        <span>Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {trades.map((t, i) => (
          <div key={t.id ?? i} className="grid grid-cols-3 px-3 py-[3.5px] font-mono text-[11px] hover:bg-white/[0.025]">
            <span className={t.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>{formatPrice(t.price)}</span>
            <span className="text-right text-slate-400 tabular-nums">{(isNaN(Number(t.amount)) ? 0 : Number(t.amount)).toFixed(5)}</span>
            <span className="text-right text-slate-600">{t.time ?? '—'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── Field (input helper) ─────────────────────────────────────────────────────
function Field({ label, value, onChange, suffix, readOnly }) {
  return (
    <label className="mb-2 flex items-center rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2.5 focus-within:border-amber-400/30">
      <span className="w-14 shrink-0 text-[11px] text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={readOnly}
        inputMode="decimal"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right font-mono text-xs text-slate-200 focus:ring-0 disabled:opacity-50"
      />
      <span className="ml-2 w-10 shrink-0 text-right text-[11px] text-slate-500">{suffix}</span>
    </label>
  )
}

// ─── Order Form ───────────────────────────────────────────────────────────────
function OrderForm({ market, side, onAuthOpen, onOrderSubmitted, balances, onLocalTrade }) {
  const { user } = useAuth()
  const [type, setType] = useState('Limit')
  const [price, setPrice] = useState(String(market.price))
  const [amount, setAmount] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const stepSize = market.stepSize || '0.000001'

  useEffect(() => { setPrice(String(market.price)) }, [market.price])

  function applyPercent(pct) {
    const p = Number(price || market.price)
    if (side === 'BUY') {
      const usdBal = Number(balances.USDT || 0)
      if (!usdBal || !p) return setAmount('')
      setAmount(floorToStep((usdBal * pct) / 100 / p, stepSize))
    } else {
      const baseBal = Number(balances[market.base] || 0)
      setAmount(floorToStep((baseBal * pct) / 100, stepSize))
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!user) return onAuthOpen()
    const cleanAmt = floorToStep(amount, stepSize)
    if (!cleanAmt || Number(cleanAmt) <= 0) return toast.error('Enter a valid amount')
    if (type === 'Stop' && (!stopPrice || Number(stopPrice) <= 0)) return toast.error('Enter a valid stop price')

    const p = Number(price || market.price)
    const a = Number(cleanAmt)
    const cost = side === 'BUY' ? a * p : a

    if (side === 'BUY' && Number(balances.USDT || 0) < cost) return toast.error('Insufficient USDT balance')
    if (side === 'SELL' && Number(balances[market.base] || 0) < a) return toast.error(`Insufficient ${market.base} balance`)

    setBusy(true)
    try {
      try {
        if (type === 'Market' && side === 'BUY') {
          await tradingService.placeMarketOrder(market.symbol, side, '0', String(cost))
        } else if (type === 'Market') {
          await tradingService.placeMarketOrder(market.symbol, side, cleanAmt)
        } else if (type === 'Stop') {
          await tradingService.placeStopOrder(market.symbol, side, stopPrice, cleanAmt, price)
        } else {
          await tradingService.placeLimitOrder(market.symbol, side, price, cleanAmt)
        }
      } catch {
        // Backend unavailable — simulate locally
      }
      onLocalTrade?.({ side, base: market.base, amount: a, price: p, cost })
      toast.success(`${side === 'BUY' ? '🟢 Buy' : '🔴 Sell'} order placed — ${cleanAmt} ${market.base} @ ${formatPrice(p)} USDT`)
      setAmount('')
      onOrderSubmitted?.()
    } catch (err) {
      toast.error(err.message || 'Order could not be submitted')
    } finally {
      setBusy(false)
    }
  }

  const total = amount && price ? Number(amount) * Number(price) : 0
  const usdBalance = Number(balances.USDT || 0)
  const baseBalance = Number(balances[market.base] || 0)

  return (
    <form onSubmit={submit} className="flex-1 px-4 py-3">
      <div className="mb-3 flex gap-4 text-xs">
        {['Limit', 'Market', 'Stop'].map((t) => (
          <button type="button" key={t} onClick={() => setType(t)}
            className={type === t ? 'text-amber-400 font-semibold' : 'text-slate-600 hover:text-slate-300'}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mb-2 flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[11px]">
        <span className="text-slate-500">Available</span>
        <span className="font-mono text-slate-300" suppressHydrationWarning>
          {side === 'BUY'
            ? `${usdBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
            : `${baseBalance.toFixed(6)} ${market.base}`}
        </span>
      </div>
      {type === 'Stop' && <Field label="Stop" value={stopPrice} onChange={setStopPrice} suffix="USDT" />}
      {type !== 'Market' && <Field label="Price" value={price} onChange={setPrice} suffix="USDT" />}
      <Field label="Amount" value={amount} onChange={setAmount} suffix={market.base} />
      <div className="my-2.5 flex items-center gap-1">
        {[25, 50, 75, 100].map((pct) => (
          <button type="button" key={pct} onClick={() => applyPercent(pct)}
            className="flex-1 rounded bg-white/[0.04] py-1.5 text-[10px] text-slate-500 hover:bg-white/[0.09] hover:text-slate-200 transition"
          >
            {pct}%
          </button>
        ))}
      </div>
      <div className="mb-3 flex justify-between text-[11px] text-slate-600">
        <span>Total</span>
        <span className="font-mono text-slate-400 tabular-nums">{total > 0 ? formatPrice(total) : '0.00'} USDT</span>
      </div>
      <button
        disabled={busy}
        className={`w-full rounded-lg py-2.5 text-sm font-bold text-white transition disabled:opacity-60 ${
          side === 'BUY'
            ? 'bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20'
            : 'bg-rose-500 hover:bg-rose-400 shadow-lg shadow-rose-500/20'
        }`}
      >
        {busy ? 'Placing...' : user ? `${side === 'BUY' ? 'Buy' : 'Sell'} ${market.base}` : 'Log in to trade'}
      </button>
    </form>
  )
}

// ─── Trading Panel ────────────────────────────────────────────────────────────
function TradingPanel({ market, onAuthOpen, balances, onOrderSubmitted, onLocalTrade }) {
  return (
    <section className="panel trading-panel overflow-hidden shrink-0">
      <div className="panel-title">
        <span>Spot Trading</span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
          <ShieldCheck size={11} /> Protected
        </span>
      </div>
      <div className="flex divide-x divide-white/5">
        <OrderForm market={market} side="BUY" onAuthOpen={onAuthOpen} balances={balances} onOrderSubmitted={onOrderSubmitted} onLocalTrade={onLocalTrade} />
        <OrderForm market={market} side="SELL" onAuthOpen={onAuthOpen} balances={balances} onOrderSubmitted={onOrderSubmitted} onLocalTrade={onLocalTrade} />
      </div>
    </section>
  )
}

// ─── Open Orders ──────────────────────────────────────────────────────────────
function OpenOrders({ orders = [], onCancel, localOrders = [] }) {
  const all = [...localOrders, ...orders]
  return (
    <section className="panel open-orders overflow-hidden shrink-0">
      <div className="panel-title justify-start gap-5">
        <button className="text-slate-200 text-xs">
          Open Orders
          <span className="ml-1.5 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-600">{all.length}</span>
        </button>
        <button className="text-slate-600 hover:text-slate-300 text-xs">Order History</button>
        <button className="text-slate-600 hover:text-slate-300 text-xs">Trade History</button>
      </div>
      {all.length ? (
        <div>
          <div className="grid grid-cols-6 border-b border-white/5 px-3 py-1.5 text-[9px] uppercase tracking-wider text-slate-600">
            <span>Pair</span><span>Side</span><span>Price</span><span>Qty</span><span>Status</span><span />
          </div>
          {all.map((o, i) => (
            <div key={o.id ?? i} className="grid grid-cols-6 items-center border-b border-white/5 px-3 py-2 text-xs">
              <span className="text-slate-300">{o.pair || `${o.base}/USDT`}</span>
              <span className={o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{o.side}</span>
              <span className="font-mono tabular-nums">{o.price ? formatPrice(o.price) : 'Market'}</span>
              <span className="font-mono tabular-nums">{o.quantity || o.amount}</span>
              <span className="text-amber-400">{o.status || 'OPEN'}</span>
              {o.id ? (
                <button onClick={() => onCancel(o.id)} className="text-right text-xs text-rose-400 hover:text-rose-300">
                  Cancel
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid h-24 place-items-center text-center">
          <div>
            <BookOpen className="mx-auto mb-1.5 text-slate-700" size={20} />
            <div className="text-xs text-slate-500">No open orders</div>
            <div className="mt-0.5 text-[11px] text-slate-700">Your active orders will appear here</div>
          </div>
        </div>
      )}
    </section>
  )
}

// ─── Auth Modal ───────────────────────────────────────────────────────────────
function AuthModal({ open, onClose }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('Password123!')
  const [referralCode, setReferralCode] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return null

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        toast.loading('Signing you in…', { id: 'auth' })
        await login(email, password)
        toast.dismiss('auth')
        toast.success('Welcome back!')
        onClose()
      } else {
        toast.loading('Creating your account…', { id: 'auth' })
        await register(email, password, referralCode)
        toast.dismiss('auth')
        toast.success('Account created. Welcome to TradeOff!')
        onClose()
      }
    } catch (err) {
      toast.dismiss('auth')
      toast.error(err.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#10141d] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">TradeOff exchange simulator</p>
          </div>
          <button onClick={onClose} className="icon-button"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="auth-label">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="auth-input" required />
          </label>
          <label className="auth-label">
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="auth-input" required />
          </label>
          {mode === 'register' && (
            <label className="auth-label">
              Referral Code (optional)
              <input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} type="text" className="auth-input" placeholder="e.g. LIQUIDITY" />
            </label>
          )}
          <button disabled={busy} className="mt-2 w-full rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-[#0b0e14] hover:bg-amber-300 disabled:opacity-60 transition">
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300"
        >
          {mode === 'login' ? 'New here? Create an account →' : 'Already have an account? Log in →'}
        </button>
      </div>
    </div>
  )
}

// ─── Root Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth()
  const websocket = useWebSocket()
  const [selected, setSelected] = useState(MARKET_SEED[0])
  const [authOpen, setAuthOpen] = useState(false)
  const [liveTickers, setLiveTickers] = useState({})
  const [candles, setCandles] = useState([])
  const [depth, setDepth] = useState({ bids: [], asks: [] })
  const [tradesList, setTradesList] = useState([])
  const [localOrders, setLocalOrders] = useState([])
  const [mobileTab, setMobileTab] = useState('orderbook')
  const [chartInterval, setChartInterval] = useState('1m')

  // Virtual balances persisted to localStorage
  const [virtualBalances, setVirtualBalances] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('tradeoff_virtual_balances')
        if (stored) return JSON.parse(stored)
      } catch {}
    }
    return { ...DEMO_BALANCES }
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('tradeoff_virtual_balances', JSON.stringify(virtualBalances))
    }
  }, [virtualBalances])

  // Queries
  const pairsQuery = useQuery({ queryKey: ['pairs'], queryFn: () => tradingService.getTradingPairs(), retry: 1 })
  const tickerQuery = useQuery({ queryKey: ['ticker', selected.symbol], queryFn: () => tradingService.getTicker(selected.symbol), retry: 1, refetchInterval: 5000 })
  const balancesQuery = useQuery({ queryKey: ['balances', user?.id], queryFn: () => walletService.getBalances(), enabled: !!user, retry: 1 })
  const ordersQuery = useQuery({ queryKey: ['open-orders', user?.id], queryFn: () => tradingService.getOrders({ status: 'OPEN', limit: 50 }), enabled: !!user, retry: 1 })

  const { refetch: refetchTicker } = tickerQuery
  const { refetch: refetchPairs } = pairsQuery
  const { refetch: refetchBalances } = balancesQuery
  const { refetch: refetchOrders } = ordersQuery

  // Merged markets list (backend pairs + live tickers + seed fallback)
  const markets = useMemo(() => {
    const source = pairsQuery.data?.length
      ? pairsQuery.data.map((pair) => {
          const seed = MARKET_SEED.find((s) => s.symbol === pair.symbol) || { symbol: pair.symbol, base: pair.base_asset, price: 0, change: 0, volume: '0' }
          return { ...seed, base: pair.base_asset, stepSize: pair.step_size }
        })
      : MARKET_SEED
    return source.map((m) => {
      const live = liveTickers[m.symbol]
      if (!live) return m
      return {
        ...m,
        price: Number(live.price || m.price),
        change: Number(live.change_pct_24h ?? m.change ?? 0),
        volume: live.volume_24h && +live.volume_24h > 0 ? Number(live.volume_24h).toLocaleString() : m.volume,
        high: live.high_24h ? Number(live.high_24h) : m.high,
        low: live.low_24h ? Number(live.low_24h) : m.low,
      }
    })
  }, [pairsQuery.data, liveTickers])

  // Active market (selected + live data)
  const market = useMemo(() => {
    const sel = markets.find((m) => m.symbol === selected.symbol) || selected
    const live = liveTickers[sel.symbol]
    if (live) return {
      ...sel,
      price: Number(live.price),
      change: Number(live.change_pct_24h ?? sel.change ?? 0),
      high: live.high_24h ? Number(live.high_24h) : sel.high,
      low: live.low_24h ? Number(live.low_24h) : sel.low,
    }
    if (tickerQuery.data?.price && +tickerQuery.data.price > 0)
      return { ...sel, price: +tickerQuery.data.price, change: +(tickerQuery.data.change_pct_24h ?? sel.change) }
    return sel
  }, [selected, markets, tickerQuery.data, liveTickers])

  // Balances (backend when logged in, otherwise virtual demo)
  const balances = useMemo(() => {
    if (balancesQuery.data?.balances?.length) {
      return Object.fromEntries(balancesQuery.data.balances.map((b) => [b.asset, b.available]))
    }
    return virtualBalances
  }, [balancesQuery.data, virtualBalances])

  // Apply a demo trade locally
  function applyLocalTrade({ side, base, amount, price, cost }) {
    setVirtualBalances((prev) => {
      const next = { ...prev }
      if (side === 'BUY') {
        next.USDT = Math.max(0, (next.USDT || 0) - cost)
        next[base] = (next[base] || 0) + amount
      } else {
        next[base] = Math.max(0, (next[base] || 0) - amount)
        next.USDT = (next.USDT || 0) + cost
      }
      return next
    })
    setLocalOrders((prev) => [{
      id: null,
      pair: `${base}/USDT`,
      base,
      side,
      price,
      amount: amount.toFixed(6),
      quantity: amount.toFixed(6),
      status: 'FILLED',
    }, ...prev].slice(0, 20))
  }

  function resetVirtualBalances() {
    setVirtualBalances({ ...DEMO_BALANCES })
    setLocalOrders([])
    toast.success('Virtual balances reset to demo defaults')
  }

  // Load candles, depth, trades on pair change — clears stale data first
  useEffect(() => {
    let active = true

    // Immediately clear stale data so the chart shows fresh seed candles for the new pair
    setCandles([])
    setDepth({ bids: [], asks: [] })
    setTradesList([])

    async function loadData() {
      try {
        const sym = selected.symbol
        const [c, d, t] = await Promise.all([
          tradingService.getCandles(sym, chartInterval).catch(() => []),
          tradingService.getDepth(sym, 50).catch(() => ({ bids: [], asks: [] })),
          tradingService.getRecentTrades(sym, 50).catch(() => []),
        ])
        if (!active) return
        if (c?.length) setCandles(c)
        if (d?.bids?.length || d?.asks?.length) setDepth(d)
        if (t?.length) {
          setTradesList(t.map((x) => ({
            id: x.id,
            price: Number(x.price),
            amount: Number(x.qty || x.quantity || 0),
            side: x.is_buyer_maker ? 'sell' : 'buy',
            time: new Date(x.time).toLocaleTimeString([], { hour12: false }),
          })))
        }
      } catch {}
    }

    loadData()
    const iv = setInterval(() => { if (active) loadData() }, 20000)
    return () => { active = false; clearInterval(iv) }
  }, [selected.symbol, chartInterval])

  // WebSocket: live tickers
  useEffect(() => {
    if (!websocket) return
    return websocket.subscribe('market.tickers', (event) => {
      const updates = event.tickers || []
      setLiveTickers((cur) => {
        const next = { ...cur }
        updates.forEach((t) => { next[t.symbol] = t })
        return next
      })
      // Update last candle's close from ticker
      const match = updates.find((t) => t.symbol === selected.symbol)
      if (match) {
        const newPrice = Number(match.price)
        setCandles((cur) => {
          if (!cur.length) return cur
          const next = [...cur]
          const last = { ...next[next.length - 1] }
          last.close = String(newPrice)
          if (newPrice > Number(last.high)) last.high = String(newPrice)
          if (newPrice < Number(last.low)) last.low = String(newPrice)
          next[next.length - 1] = last
          return next
        })
      }
    })
  }, [websocket, selected.symbol])

  // WebSocket: live trades + order book for current pair
  useEffect(() => {
    if (!websocket) return

    const unsubTrades = websocket.subscribe(`trades.${selected.symbol}`, (event) => {
      const trade = {
        id: event.trade_id || Math.random().toString(),
        price: Number(event.price),
        amount: Number(event.quantity || event.qty || 0),
        side: event.side?.toLowerCase() || 'buy',
        time: event.timestamp
          ? new Date(event.timestamp).toLocaleTimeString([], { hour12: false })
          : new Date().toLocaleTimeString([], { hour12: false }),
      }
      setTradesList((cur) => [trade, ...cur].slice(0, 50))
      setCandles((cur) => {
        if (!cur.length) return cur
        const next = [...cur]
        const last = { ...next[next.length - 1] }
        last.close = String(trade.price)
        if (trade.price > Number(last.high)) last.high = String(trade.price)
        if (trade.price < Number(last.low)) last.low = String(trade.price)
        next[next.length - 1] = last
        return next
      })
      refetchTicker()
    })

    const unsubDepth = websocket.subscribe(`orderbook.${selected.symbol}`, (event) => {
      if (event?.bids || event?.asks) setDepth(event)
    })

    return () => { unsubTrades(); unsubDepth() }
  }, [selected.symbol, websocket, refetchTicker])

  // WebSocket: private events (orders + wallet)
  useEffect(() => {
    if (!websocket || !user) return
    const refresh = () => { refetchOrders(); refetchBalances() }
    const unsubOrders = websocket.subscribe(`orders.${user.id}`, refresh)
    const unsubWallet = websocket.subscribe(`wallet.${user.id}`, refresh)
    return () => { unsubOrders(); unsubWallet() }
  }, [user, websocket, refetchOrders, refetchBalances])

  useEffect(() => {
    if (!user) return
    refetchPairs(); refetchTicker(); refetchBalances()
  }, [user, refetchPairs, refetchTicker, refetchBalances])

  async function cancelOrder(id) {
    try {
      await tradingService.cancelOrder(id)
      toast.success('Order cancelled')
      refetchOrders(); refetchBalances()
    } catch (err) {
      toast.error(err.message || 'Could not cancel order')
    }
  }

  function onOrderSubmitted() { refetchOrders(); refetchBalances() }

  // Live simulated price tick (resets on coin change)
  const livePrice = useLivePriceTick(market.price, market.symbol)

  const HEADER_H = 56  // matches h-14
  return (
    <div className="min-h-screen bg-[#070a0f] text-slate-300">
      <Toaster
        position="bottom-right"
        toastOptions={{ style: { background: '#171c26', color: '#e2e8f0', border: '1px solid rgba(255,255,255,.08)' } }}
      />
      <Header onAuthOpen={() => setAuthOpen(true)} markets={markets} onSelectMarket={setSelected} />

      <div className="flex overflow-hidden" style={{ height: `calc(100dvh - ${HEADER_H}px)` }}>
        <SideRail />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-1.5 gap-1.5">

          {/* Mobile: horizontal coin selector (hidden on xl+) */}
          <div className="xl:hidden flex overflow-x-auto gap-1 pb-0.5 shrink-0" style={{ scrollbarWidth: 'none' }}>
            {markets.map((m) => (
              <button
                key={m.symbol}
                onClick={() => setSelected(m)}
                className={`shrink-0 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                  selected.symbol === m.symbol
                    ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                    : 'border-white/5 bg-white/[0.025] text-slate-400 hover:bg-white/[0.05]'
                }`}
              >
                <span>{m.base}</span>
                <span className={`font-mono ${m.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {m.change >= 0 ? '+' : ''}{Number(m.change).toFixed(1)}%
                </span>
              </button>
            ))}
          </div>

          {/* Top row: Market Selector | Ticker+Chart | Order Book */}
          <div className="grid min-h-0 flex-1 gap-1.5 xl:grid-cols-[220px_minmax(0,1fr)_260px]">

            {/* Left: Market Selector — desktop only */}
            <div className="hidden xl:flex xl:flex-col min-h-0">
              <MarketSelector markets={markets} selected={market} onSelect={setSelected} />
            </div>

            {/* Center: Ticker strip + Chart */}
            <div className="flex min-w-0 flex-col gap-1.5 min-h-0">
              <TickerStrip market={market} livePrice={livePrice} />
              <div className="flex-1 min-h-0">
                <PriceChart market={market} candles={candles} interval={chartInterval} onIntervalChange={setChartInterval} />
              </div>
            </div>

            {/* Right: Order Book — desktop only */}
            <div className="hidden xl:flex xl:flex-col min-h-0">
              <OrderBook market={market} depth={depth} livePrice={livePrice} />
            </div>
          </div>

          {/* Bottom row: Trading Panel + Open Orders | Recent Trades */}
          <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_260px]" style={{ minHeight: 280 }}>
            <div className="flex flex-col gap-1.5 min-h-0">
              {!user && (
                <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-[11px] text-slate-600">
                  <span>Demo mode — virtual balance active.</span>
                  <button onClick={resetVirtualBalances} className="text-amber-400 hover:underline">Reset</button>
                </div>
              )}
              <TradingPanel
                market={market}
                balances={balances}
                onAuthOpen={() => setAuthOpen(true)}
                onOrderSubmitted={onOrderSubmitted}
                onLocalTrade={applyLocalTrade}
              />
              <OpenOrders
                orders={ordersQuery.data?.orders || []}
                onCancel={cancelOrder}
                localOrders={user ? [] : localOrders}
              />
            </div>
            {/* Recent Trades — desktop only */}
            <div className="hidden xl:flex xl:flex-col min-h-0">
              <RecentTrades market={market} tradesList={tradesList} livePrice={livePrice} />
            </div>
          </div>

          {/* Mobile: Order Book / Recent Trades tab switcher */}
          <div className="xl:hidden shrink-0">
            <div className="mb-1.5 flex rounded-xl border border-white/5 overflow-hidden text-xs">
              {[['orderbook', 'Order Book'], ['trades', 'Market Trades']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMobileTab(key)}
                  className={`flex-1 py-2.5 font-medium transition ${
                    mobileTab === key
                      ? 'bg-amber-400/10 text-amber-400'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.025]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ height: 320 }}>
              {mobileTab === 'orderbook' ? (
                <OrderBook market={market} depth={depth} livePrice={livePrice} />
              ) : (
                <RecentTrades market={market} tradesList={tradesList} livePrice={livePrice} />
              )}
            </div>
          </div>

        </main>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
