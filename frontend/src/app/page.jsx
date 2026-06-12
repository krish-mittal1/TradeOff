'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ArrowDown, ArrowUp, BarChart3, Bell, BookOpen, ChevronDown,
  CircleDollarSign, LayoutDashboard, LogOut, Menu, Moon, Search, Settings,
  ShieldCheck, Star, Sun, Wallet, X, TrendingUp, TrendingDown,
} from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { tradingService } from '@/services/tradingService'
import { walletService } from '@/services/walletService'
import { useAuth } from '@/providers/AuthProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useWebSocket } from '@/providers/WebSocketProvider'
import { CandlestickChart } from '@/components/trading/CandlestickChart'

// ─── Seed Market Data ──────────────────────────────────────────────────────────
const MARKET_SEED = [
  { symbol: 'BTCUSDT', base: 'BTC', price: 68429.12, change: 2.84, volume: '1.42B' },
  { symbol: 'ETHUSDT', base: 'ETH', price: 3641.87, change: 1.92, volume: '824.6M' },
  { symbol: 'BNBUSDT', base: 'BNB', price: 612.40, change: 0.84, volume: '412.1M' },
  { symbol: 'SOLUSDT', base: 'SOL', price: 172.46, change: -0.74, volume: '318.2M' },
  { symbol: 'XRPUSDT', base: 'XRP', price: 0.6245, change: 1.18, volume: '689.4M' },
  { symbol: 'ADAUSDT', base: 'ADA', price: 0.4518, change: 4.11, volume: '91.8M' },
  { symbol: 'DOGEUSDT', base: 'DOGE', price: 0.1682, change: -1.03, volume: '211.5M' },
  { symbol: 'AVAXUSDT', base: 'AVAX', price: 41.28, change: 2.06, volume: '122.7M' },
  { symbol: 'LINKUSDT', base: 'LINK', price: 18.74, change: 0.58, volume: '98.4M' },
  { symbol: 'DOTUSDT', base: 'DOT', price: 7.35, change: -0.22, volume: '76.2M' },
  { symbol: 'MATICUSDT', base: 'MATIC', price: 0.7124, change: 1.47, volume: '64.9M' },
  { symbol: 'LTCUSDT', base: 'LTC', price: 84.50, change: 0.31, volume: '54.1M' },
]

// Default virtual balances for demo trading
const DEMO_BALANCES = {
  USDT: 10000,
  BTC: 0.15,
  ETH: 2.0,
  BNB: 5.0,
  SOL: 25.0,
  XRP: 500,
  ADA: 1000,
  DOGE: 2000,
  AVAX: 30,
  LINK: 40,
  DOT: 80,
  MATIC: 500,
  LTC: 2,
}

// ─── Order book seed helpers ───────────────────────────────────────────────────
const seedBook = (mid, side) => Array.from({ length: 12 }, (_, i) => {
  const offset = (i + 1) * (mid > 1000 ? 5.73 : mid > 10 ? 0.09 : 0.0004)
  const price = side === 'ask' ? mid + offset : mid - offset
  const amount = ((i * 7 + 3) % 19 + 0.14) / (mid > 1000 ? 10 : 1)
  return { price, amount, total: amount * price, depth: 22 + ((i * 17) % 72) }
})

const seedTrades = (mid) => Array.from({ length: 20 }, (_, i) => ({
  id: i,
  price: mid + ((i % 5) - 2) * 3.17,
  amount: ((i * 13) % 47 + 2) / 1000,
  side: i % 3 === 0 ? 'sell' : 'buy',
  time: `${String(11).padStart(2, '0')}:${String(30 + Math.floor(i / 2)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
}))

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatPrice(value) {
  const n = Number(value || 0)
  return n >= 100
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
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
function useLivePriceTick(basePrice, interval = 2500) {
  const [price, setPrice] = useState(basePrice)
  const priceRef = useRef(basePrice)

  useEffect(() => {
    priceRef.current = basePrice
    setPrice(basePrice)
  }, [basePrice])

  useEffect(() => {
    const id = setInterval(() => {
      const volatility = priceRef.current * 0.0008
      const change = (Math.random() - 0.5) * volatility
      priceRef.current = Math.max(priceRef.current * 0.9, priceRef.current + change)
      setPrice(priceRef.current)
    }, interval)
    return () => clearInterval(id)
  }, [interval])

  return price
}

// ─── Header ───────────────────────────────────────────────────────────────────
function Header({ onAuthOpen }) {
  const { user, logout } = useAuth()
  const themeCtx = useTheme()
  const theme = themeCtx?.theme ?? 'dark'
  const toggleTheme = themeCtx?.toggleTheme ?? (() => {})
  const websocket = useWebSocket()
  const [mobileOpen, setMobileOpen] = useState(false)
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
      <div className="flex h-16 items-center gap-6 px-4 lg:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#0b0e14] shadow-lg shadow-amber-500/20">
            <BarChart3 size={20} strokeWidth={2.8} />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">TradeOff</span>
        </div>

        <nav className="hidden items-center gap-1 text-sm text-slate-400 md:flex">
          {navItems.map(([label, href], i) => (
            <Link
              href={href}
              key={label}
              className={`rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white ${i === 1 ? 'bg-white/5 text-white' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden w-full max-w-sm items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2 text-sm text-slate-500 lg:flex">
          <Search size={16} />
          <span>Search markets</span>
          <kbd className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[10px]">/</kbd>
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span
            className={`hidden rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex ${
              websocket?.connected
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.035] text-slate-500'
            }`}
          >
            {websocket?.connected ? '● Live' : '○ Offline'}
          </span>
          <button onClick={toggleTheme} className="icon-button" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/notifications" className="icon-button" aria-label="Notifications">
            <Bell size={17} />
          </Link>
          {user ? (
            <button
              onClick={logout}
              className="hidden items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white sm:flex"
            >
              <LogOut size={15} /> Log out
            </button>
          ) : (
            <>
              <button onClick={onAuthOpen} className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white sm:block">
                Log in
              </button>
              <button
                onClick={onAuthOpen}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300 transition"
              >
                Get started
              </button>
            </>
          )}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="icon-button md:hidden" aria-label="Menu">
            <Menu size={18} />
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
    <aside className="hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-white/5 bg-[#090c12] py-4 lg:flex">
      {items.map(([Icon, href, label], i) => (
        <Link
          href={href}
          key={href + i}
          title={label}
          className={`grid h-9 w-9 place-items-center rounded-lg transition ${
            i === 1 ? 'bg-amber-400/10 text-amber-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Icon size={18} />
        </Link>
      ))}
      <Link href="/profile" title="Settings" className="mt-auto grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200">
        <Settings size={18} />
      </Link>
    </aside>
  )
}

// ─── Market Selector ──────────────────────────────────────────────────────────
function MarketSelector({ markets, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const filtered = markets.filter((m) => m.symbol.toLowerCase().includes(query.toLowerCase()))

  return (
    <section className="panel market-selector flex flex-col overflow-hidden" style={{ minHeight: 360 }}>
      <div className="panel-title">
        <span>Markets</span>
        <Star size={15} className="text-slate-600" />
      </div>
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2 text-xs text-slate-500">
        <Search size={14} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full border-0 bg-transparent p-0 text-xs text-slate-200 placeholder:text-slate-600 focus:ring-0"
          placeholder="Search pair"
        />
      </div>
      <div className="grid grid-cols-[1fr_1fr_0.7fr] px-3 py-1 text-[10px] uppercase tracking-wider text-slate-600">
        <span>Pair</span><span className="text-right">Price</span><span className="text-right">24h</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((m) => (
          <button
            key={m.symbol}
            onClick={() => onSelect(m)}
            className={`grid w-full grid-cols-[1fr_1fr_0.7fr] items-center px-3 py-2 text-xs transition hover:bg-white/[0.035] ${
              selected.symbol === m.symbol ? 'bg-white/[0.06]' : ''
            }`}
          >
            <span className="flex items-center gap-1.5 text-left font-medium text-slate-200">
              <Star
                size={11}
                className={selected.symbol === m.symbol ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
              />
              {m.base}<span className="text-slate-600">/USDT</span>
            </span>
            <span className="text-right font-mono text-slate-300">{formatPrice(m.price)}</span>
            <span className={`text-right font-mono ${m.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
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
  return (
    <section className="panel ticker-strip flex min-h-[86px] items-center gap-6 overflow-x-auto px-5 py-3">
      <div className="min-w-fit">
        <div className="flex items-center gap-2 text-base font-semibold text-white">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-400/10 text-xs text-amber-400">
            {market.base?.[0]}
          </span>
          {market.base}/USDT <ChevronDown size={15} className="text-slate-600" />
        </div>
        <div className="mt-1 text-[11px] text-slate-600">Spot market</div>
      </div>
      <div className="min-w-fit">
        <div className={`font-mono text-xl font-bold transition-colors ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
          {formatPrice(displayPrice)}
        </div>
        <div className="text-[11px] text-slate-600">${formatPrice(displayPrice)}</div>
      </div>
      {[
        ['24h Change', `${market.change >= 0 ? '+' : ''}${Number(market.change).toFixed(2)}%`, isUp ? 'text-emerald-400' : 'text-rose-400'],
        ['24h High', formatPrice(market.price * 1.032), 'text-slate-300'],
        ['24h Low', formatPrice(market.price * 0.958), 'text-slate-300'],
        [`24h Volume (${market.base})`, market.volume, 'text-slate-300'],
      ].map(([label, value, color]) => (
        <div key={label} className="min-w-fit">
          <div className="text-[11px] text-slate-600">{label}</div>
          <div className={`mt-1 font-mono text-xs ${color}`}>{value}</div>
        </div>
      ))}
    </section>
  )
}

// ─── Price Chart (wrapper for CandlestickChart) ───────────────────────────────
function PriceChart({ market, candles }) {
  const [tab, setTab] = useState('1m')
  const tabs = ['1m', '5m', '15m', '1H', '4H', '1D']
  return (
    <section className="panel price-chart flex flex-col overflow-hidden h-full">
      <div className="panel-title">
        <div className="flex items-center gap-3">
          <span>Chart</span>
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[11px] transition ${
                t === tab ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
              } ${t !== '1m' ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <BarChart3 size={14} />
          <span>Candles</span>
        </div>
      </div>
      <div className="flex-1 px-2 pb-2 pt-0 min-h-0">
        <CandlestickChart market={market} candles={candles} />
      </div>
    </section>
  )
}

// ─── Order Book ───────────────────────────────────────────────────────────────
function OrderBook({ market, depth }) {
  const bids = useMemo(() => {
    if (!depth?.bids?.length) return seedBook(market.price, 'bid')
    return depth.bids.slice(0, 12).map(([p, q]) => ({ price: +p, amount: +q, total: +p * +q }))
  }, [depth, market.price])

  const asks = useMemo(() => {
    if (!depth?.asks?.length) return seedBook(market.price, 'ask').reverse()
    return depth.asks.slice(0, 12).map(([p, q]) => ({ price: +p, amount: +q, total: +p * +q })).reverse()
  }, [depth, market.price])

  const withDepth = (list) => {
    let cum = 0
    const mapped = list.map((x) => { cum += x.amount; return { ...x, cumulative: cum } })
    const total = cum || 1
    return mapped.map((x) => ({ ...x, depth: Math.min(100, (x.cumulative / total) * 100) }))
  }

  const asksWithDepth = withDepth([...asks].reverse()).reverse()
  const bidsWithDepth = withDepth(bids)

  const row = (item, side, i) => (
    <div key={`${side}-${i}`} className="relative grid grid-cols-3 px-3 py-[3.5px] font-mono text-[11px] hover:bg-white/[0.02]">
      <span className={`relative z-10 ${side === 'ask' ? 'text-rose-400' : 'text-emerald-400'}`}>{formatPrice(item.price)}</span>
      <span className="relative z-10 text-right text-slate-400">{item.amount.toFixed(5)}</span>
      <span className="relative z-10 text-right text-slate-600">{item.total.toFixed(2)}</span>
      <span
        className={`absolute inset-y-0 right-0 ${side === 'ask' ? 'bg-rose-500/[0.08]' : 'bg-emerald-500/[0.08]'}`}
        style={{ width: `${item.depth}%` }}
      />
    </div>
  )

  return (
    <section className="panel order-book flex flex-col overflow-hidden h-full">
      <div className="panel-title">
        <span>Order Book</span>
        <span className="text-[10px] text-slate-600">0.10 USDT</span>
      </div>
      <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-slate-600">
        <span>Price (USDT)</span>
        <span className="text-right">Amount ({market.base})</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div>{asksWithDepth.map((x, i) => row(x, 'ask', i))}</div>
        <div className="flex items-center gap-2 border-y border-white/5 px-3 py-2 font-mono text-sm font-bold">
          {market.change >= 0 ? <ArrowUp size={14} className="text-emerald-400" /> : <ArrowDown size={14} className="text-rose-400" />}
          <span className={market.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatPrice(market.price)}</span>
          <span className="ml-auto text-[10px] font-normal text-slate-600">Spread 0.01%</span>
        </div>
        <div>{bidsWithDepth.map((x, i) => row(x, 'bid', i))}</div>
      </div>
    </section>
  )
}

// ─── Recent Trades ────────────────────────────────────────────────────────────
function RecentTrades({ market, tradesList }) {
  const seeded = useMemo(() => seedTrades(market.price), [market.price])
  const trades = tradesList?.length ? tradesList : seeded
  return (
    <section className="panel recent-trades flex flex-col overflow-hidden">
      <div className="panel-title">
        <span>Market Trades</span>
        <Activity size={14} className="text-slate-600" />
      </div>
      <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-slate-600">
        <span>Price (USDT)</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.map((t, i) => (
          <div key={t.id ?? i} className="grid grid-cols-3 px-3 py-[4px] font-mono text-[11px] hover:bg-white/[0.025]">
            <span className={t.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>{formatPrice(t.price)}</span>
            <span className="text-right text-slate-400">{(isNaN(Number(t.amount)) ? 0 : Number(t.amount)).toFixed(5)}</span>
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

    // Check local balances
    if (side === 'BUY' && Number(balances.USDT || 0) < cost) return toast.error('Insufficient USDT balance')
    if (side === 'SELL' && Number(balances[market.base] || 0) < a) return toast.error(`Insufficient ${market.base} balance`)

    setBusy(true)
    try {
      // Try backend first
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
      // Always update local balances for demo feel
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
      <div className="mb-4 flex gap-4 text-xs">
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
      <div className="my-3 flex items-center gap-1.5">
        {[25, 50, 75, 100].map((pct) => (
          <button type="button" key={pct} onClick={() => applyPercent(pct)}
            className="flex-1 rounded bg-white/[0.04] py-1.5 text-[10px] text-slate-500 hover:bg-white/[0.09] hover:text-slate-200 transition"
          >
            {pct}%
          </button>
        ))}
      </div>
      <div className="mb-4 flex justify-between text-[11px] text-slate-600">
        <span>Total</span>
        <span className="font-mono text-slate-400">{total > 0 ? formatPrice(total) : '0.00'} USDT</span>
      </div>
      <button
        disabled={busy}
        className={`w-full rounded-lg py-3 text-sm font-bold text-white transition disabled:opacity-60 ${
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
  const [activeSide, setActiveSide] = useState(null)
  return (
    <section className="panel trading-panel overflow-hidden">
      <div className="panel-title">
        <span>Spot Trading</span>
        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
          <ShieldCheck size={12} /> Protected execution
        </span>
      </div>
      <div className="flex divide-x divide-white/5">
        <OrderForm
          market={market}
          side="BUY"
          onAuthOpen={onAuthOpen}
          balances={balances}
          onOrderSubmitted={onOrderSubmitted}
          onLocalTrade={onLocalTrade}
        />
        <OrderForm
          market={market}
          side="SELL"
          onAuthOpen={onAuthOpen}
          balances={balances}
          onOrderSubmitted={onOrderSubmitted}
          onLocalTrade={onLocalTrade}
        />
      </div>
    </section>
  )
}

// ─── Open Orders ──────────────────────────────────────────────────────────────
function OpenOrders({ orders = [], onCancel, localOrders = [] }) {
  const all = [...localOrders, ...orders]
  return (
    <section className="panel open-orders overflow-hidden" style={{ minHeight: 180 }}>
      <div className="panel-title justify-start gap-6">
        <button className="text-slate-200">
          Open Orders{' '}
          <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-600">{all.length}</span>
        </button>
        <button className="text-slate-600 hover:text-slate-300">Order History</button>
        <button className="text-slate-600 hover:text-slate-300">Trade History</button>
      </div>
      {all.length ? (
        <div>
          <div className="grid grid-cols-6 border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-600">
            <span>Pair</span><span>Side</span><span>Price</span><span>Quantity</span><span>Status</span><span />
          </div>
          {all.map((o, i) => (
            <div key={o.id ?? i} className="grid grid-cols-6 items-center border-b border-white/5 px-3 py-2 text-xs">
              <span className="text-slate-300">{o.pair || `${o.base}/USDT`}</span>
              <span className={o.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{o.side}</span>
              <span className="font-mono">{o.price ? formatPrice(o.price) : 'Market'}</span>
              <span className="font-mono">{o.quantity || o.amount}</span>
              <span className="text-amber-400">{o.status || 'OPEN'}</span>
              {o.id && (
                <button onClick={() => onCancel(o.id)} className="text-right text-xs text-rose-400 hover:text-rose-300">
                  Cancel
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid h-32 place-items-center text-center">
          <div>
            <BookOpen className="mx-auto mb-2 text-slate-700" size={22} />
            <div className="text-xs text-slate-500">No open orders</div>
            <div className="mt-1 text-[11px] text-slate-700">Your active orders will appear here</div>
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
        toast.loading('Creating your TradeOff account…', { id: 'auth' })
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
          <button onClick={onClose} className="icon-button"><X size={17} /></button>
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

  // Local virtual balances (used as fallback when backend is offline)
  const [virtualBalances, setVirtualBalances] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('tradeoff_virtual_balances')
        if (stored) return JSON.parse(stored)
      } catch {}
    }
    return { ...DEMO_BALANCES }
  })

  // Save virtual balances to localStorage whenever they change
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

  // Markets list
  const markets = useMemo(() => {
    const source = pairsQuery.data?.length
      ? pairsQuery.data.map((pair) => ({
          ...(MARKET_SEED.find((s) => s.symbol === pair.symbol) || { symbol: pair.symbol, base: pair.base_asset, price: 0, change: 0, volume: '0' }),
          base: pair.base_asset,
          stepSize: pair.step_size,
        }))
      : MARKET_SEED
    return source.map((m) => {
      const live = liveTickers[m.symbol]
      return live ? { ...m, price: Number(live.price || m.price), change: Number(live.change_pct_24h ?? m.change ?? 0), volume: live.volume_24h && +live.volume_24h > 0 ? Number(live.volume_24h).toLocaleString() : m.volume } : m
    })
  }, [pairsQuery.data, liveTickers])

  // Selected market merged with live data
  const market = useMemo(() => {
    const sel = markets.find((m) => m.symbol === selected.symbol) || selected
    const live = liveTickers[sel.symbol]
    if (live) return { ...sel, price: Number(live.price), change: Number(live.change_pct_24h ?? sel.change ?? 0) }
    if (tickerQuery.data?.price && +tickerQuery.data.price > 0)
      return { ...sel, price: +tickerQuery.data.price, change: +tickerQuery.data.change_pct_24h ?? sel.change }
    return sel
  }, [selected, markets, tickerQuery.data, liveTickers])

  // Compute balances — use backend if available, otherwise local virtual
  const balances = useMemo(() => {
    if (balancesQuery.data?.balances?.length) {
      return Object.fromEntries(balancesQuery.data.balances.map((b) => [b.asset, b.available]))
    }
    return virtualBalances
  }, [balancesQuery.data, virtualBalances])

  // Apply a local trade (deduct/add from virtual balances)
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
    // Add to local orders
    const order = {
      id: null,
      pair: `${base}/USDT`,
      base,
      side,
      price,
      amount: amount.toFixed(6),
      quantity: amount.toFixed(6),
      status: 'FILLED',
    }
    setLocalOrders((prev) => [order, ...prev].slice(0, 20))
  }

  // Reset virtual balances to demo defaults
  function resetVirtualBalances() {
    setVirtualBalances({ ...DEMO_BALANCES })
    setLocalOrders([])
    toast.success('Virtual balances reset to demo defaults')
  }

  // Load candles, depth, and trades on pair change
  useEffect(() => {
    let active = true
    async function loadData() {
      try {
        const sym = selected.symbol
        const [c, d, t] = await Promise.all([
          tradingService.getCandles(sym, '1m').catch(() => []),
          tradingService.getDepth(sym, 50).catch(() => ({ bids: [], asks: [] })),
          tradingService.getRecentTrades(sym, 50).catch(() => []),
        ])
        if (!active) return
        if (c?.length) setCandles(c)
        if (d) setDepth(d)
        if (t?.length) {
          setTradesList(t.map((x) => ({
            id: x.id,
            price: Number(x.price),
            amount: Number(x.qty),
            side: x.is_buyer_maker ? 'sell' : 'buy',
            time: new Date(x.time).toLocaleTimeString([], { hour12: false }),
          })))
        }
      } catch {}
    }
    loadData()
    const iv = setInterval(() => { if (active) loadData() }, 20000)
    return () => { active = false; clearInterval(iv) }
  }, [selected.symbol])

  // WebSocket: tickers
  useEffect(() => {
    if (!websocket) return
    return websocket.subscribe('market.tickers', (event) => {
      const updates = event.tickers || []
      setLiveTickers((cur) => {
        const next = { ...cur }
        updates.forEach((t) => { next[t.symbol] = t })
        return next
      })
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

  // WebSocket: trades + orderbook
  useEffect(() => {
    if (!websocket) return
    const unsubTrades = websocket.subscribe(`trades.${selected.symbol}`, (event) => {
      const trade = {
        id: event.trade_id || Math.random().toString(),
        price: Number(event.price),
        amount: Number(event.quantity || event.qty),
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
      refetchTicker()
    })

    return () => { unsubTrades(); unsubDepth() }
  }, [selected.symbol, websocket, refetchTicker])

  // WebSocket: private events
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

  // Live simulated price
  const livePrice = useLivePriceTick(market.price)

  return (
    <div className="min-h-screen bg-[#070a0f] text-slate-300">
      <Toaster
        position="bottom-right"
        toastOptions={{ style: { background: '#171c26', color: '#e2e8f0', border: '1px solid rgba(255,255,255,.08)' } }}
      />
      <Header onAuthOpen={() => setAuthOpen(true)} />

      <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>
        <SideRail />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-2 lg:p-3 gap-2">
          {/* Top grid */}
          <div className="grid min-h-0 flex-1 gap-2 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
            {/* Left: Market Selector */}
            <div className="hidden xl:flex xl:flex-col min-h-0">
              <MarketSelector markets={markets} selected={market} onSelect={setSelected} />
            </div>

            {/* Center: Ticker + Chart */}
            <div className="flex min-w-0 flex-col gap-2 min-h-0">
              <TickerStrip market={market} livePrice={livePrice} />
              <div style={{ height: 'calc(100vh - 450px)', minHeight: 240 }}>
                <PriceChart market={market} candles={candles} />
              </div>
            </div>

            {/* Right: Order Book */}
            <div className="flex flex-col min-h-0">
              <OrderBook market={market} depth={depth} />
            </div>
          </div>

          {/* Bottom grid */}
          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_280px]" style={{ minHeight: 260 }}>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-slate-600 px-1">
                {!user && (
                  <span>
                    Demo mode — virtual balance available.{' '}
                    <button onClick={resetVirtualBalances} className="text-amber-400 hover:underline">Reset</button>
                  </span>
                )}
              </div>
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
            <div className="flex flex-col min-h-0" style={{ minHeight: 260 }}>
              <RecentTrades market={market} tradesList={tradesList} />
            </div>
          </div>
        </main>
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
