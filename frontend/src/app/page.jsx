'use client'

import { useEffect, useMemo, useState } from 'react'
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

const seedBook = (mid, side) => Array.from({ length: 11 }, (_, index) => {
  const offset = (index + 1) * (mid > 1000 ? 4.73 : mid > 10 ? 0.08 : 0.0003)
  const price = side === 'ask' ? mid + offset : mid - offset
  const amount = ((index * 7 + 3) % 19 + 0.14) / (mid > 1000 ? 10 : 1)
  return { price, amount, total: amount * price, depth: 22 + ((index * 17) % 72) }
})

const seedTrades = (mid) => Array.from({ length: 16 }, (_, index) => ({
  id: index,
  price: mid + ((index % 4) - 2) * 3.17,
  amount: ((index * 13) % 47 + 2) / 1000,
  side: index % 3 === 0 ? 'sell' : 'buy',
  time: `12:${String(48 - Math.floor(index / 3)).padStart(2, '0')}:${String(52 - index * 3).padStart(2, '0')}`,
}))

function formatPrice(value) {
  const number = Number(value || 0)
  return number >= 100 ? number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : number.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function stepDecimals(stepSize) {
  const [, decimals = ''] = String(stepSize || '0.000001').split('.')
  return decimals.replace(/0+$/, '').length
}

function floorToStep(value, stepSize = '0.000001') {
  const number = Number(value || 0)
  const step = Number(stepSize || 0.000001)
  if (!Number.isFinite(number) || number <= 0 || !Number.isFinite(step) || step <= 0) return ''
  const floored = Math.floor((number + Number.EPSILON) / step) * step
  return floored.toFixed(stepDecimals(stepSize))
}

function Header({ onAuthOpen }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const websocket = useWebSocket()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navItems = [['Markets', '/'], ['Trade', '/'], ['Portfolio', '/portfolio'], ['Wallets', '/wallets'], ['Copy Trading', '/copy-trading'], ['AI', '/assistant']]

  return (
    <header className="exchange-header sticky top-0 z-50 border-b border-white/5 bg-[#090c12]/95 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-6 px-4 lg:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#0b0e14] shadow-lg shadow-amber-500/10">
            <BarChart3 size={20} strokeWidth={2.8} />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">TradeOff</span>
        </div>

        <nav className="hidden items-center gap-1 text-sm text-slate-400 md:flex">
          {navItems.map(([item, href], index) => (
            <Link href={href} key={item} className={`rounded-lg px-3 py-2 transition hover:bg-white/5 hover:text-white ${index === 1 ? 'bg-white/5 text-white' : ''}`}>
              {item}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden w-full max-w-sm items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2 text-sm text-slate-500 lg:flex">
          <Search size={16} />
          <span>Search markets</span>
          <kbd className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[10px]">/</kbd>
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className={`hidden rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex ${websocket?.connected ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.035] text-slate-500'}`}>
            {websocket?.connected ? 'Live' : 'Offline'}
          </span>
          <button onClick={toggleTheme} className="icon-button" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link href="/notifications" className="icon-button" aria-label="Notifications"><Bell size={17} /></Link>
          {user ? (
            <button onClick={logout} className="hidden items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:text-white sm:flex">
              <LogOut size={15} /> Log out
            </button>
          ) : (
            <>
              <button onClick={onAuthOpen} className="hidden rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white sm:block">Log in</button>
              <button onClick={onAuthOpen} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300">Get started</button>
            </>
          )}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="icon-button md:hidden" aria-label="Menu"><Menu size={18} /></button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="mobile-menu md:hidden">
          {navItems.map(([item, href]) => (
            <Link key={item} href={href} onClick={() => setMobileOpen(false)}>{item}</Link>
          ))}
          {user && <button onClick={logout}>Log out</button>}
        </nav>
      )}
    </header>
  )
}

function SideRail() {
  const items = [
    [LayoutDashboard, '/portfolio'],
    [Activity, '/'],
    [BookOpen, '/'],
    [Wallet, '/wallets'],
    [CircleDollarSign, '/copy-trading'],
  ]
  return (
    <aside className="exchange-rail hidden w-14 shrink-0 flex-col items-center gap-3 border-r border-white/5 bg-[#090c12] py-4 lg:flex">
      {items.map(([Icon, href], index) => (
        <Link href={href} key={href + index} className={`grid h-9 w-9 place-items-center rounded-lg transition ${index === 1 ? 'bg-amber-400/10 text-amber-400' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}>
          <Icon size={18} />
        </Link>
      ))}
      <Link href="/profile" className="mt-auto grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200"><Settings size={18} /></Link>
    </aside>
  )
}

function MarketSelector({ markets, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const filtered = markets.filter((market) => market.symbol.toLowerCase().includes(query.toLowerCase()))

  return (
    <section className="panel market-selector min-h-[360px] overflow-hidden">
      <div className="panel-title">
        <span>Markets</span>
        <Star size={15} className="text-slate-600" />
      </div>
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2 text-xs text-slate-500">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full border-0 bg-transparent p-0 text-xs text-slate-200 placeholder:text-slate-600 focus:ring-0" placeholder="Search pair" />
      </div>
      <div className="grid grid-cols-[1fr_1fr_0.7fr] px-3 py-2 text-[10px] uppercase tracking-wider text-slate-600">
        <span>Pair</span><span className="text-right">Last price</span><span className="text-right">24h</span>
      </div>
      <div>
        {filtered.map((market) => (
          <button key={market.symbol} onClick={() => onSelect(market)} className={`grid w-full grid-cols-[1fr_1fr_0.7fr] items-center px-3 py-2.5 text-xs transition hover:bg-white/[0.035] ${selected.symbol === market.symbol ? 'bg-white/[0.045]' : ''}`}>
            <span className="flex items-center gap-2 text-left font-medium text-slate-200">
              <Star size={12} className={selected.symbol === market.symbol ? 'fill-amber-400 text-amber-400' : 'text-slate-700'} />
              {market.base}<span className="text-slate-600">/USDT</span>
            </span>
            <span className="text-right font-mono text-slate-300">{formatPrice(market.price)}</span>
            <span className={`text-right font-mono ${market.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{market.change >= 0 ? '+' : ''}{market.change}%</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function TickerStrip({ market }) {
  return (
    <section className="panel ticker-strip flex min-h-[86px] items-center gap-7 overflow-x-auto px-5 py-3">
      <div className="min-w-fit">
        <div className="flex items-center gap-2 text-base font-semibold text-white">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-400/10 text-xs text-amber-400">{market.base[0]}</span>
          {market.base}/USDT <ChevronDown size={15} className="text-slate-600" />
        </div>
        <div className="mt-1 text-[11px] text-slate-600">Spot market</div>
      </div>
      <div className="min-w-fit">
        <div className="font-mono text-xl font-semibold text-emerald-400">{formatPrice(market.price)}</div>
        <div className="text-[11px] text-slate-600">${formatPrice(market.price)}</div>
      </div>
      {[
        ['24h Change', `${market.change >= 0 ? '+' : ''}${market.change}%`, market.change >= 0],
        ['24h High', formatPrice(market.price * 1.032)],
        ['24h Low', formatPrice(market.price * 0.958)],
        [`24h Volume (${market.base})`, market.volume],
      ].map(([label, value, positive]) => (
        <div key={label} className="min-w-fit">
          <div className="text-[11px] text-slate-600">{label}</div>
          <div className={`mt-1 font-mono text-xs ${positive === true ? 'text-emerald-400' : positive === false ? 'text-rose-400' : 'text-slate-300'}`}>{value}</div>
        </div>
      ))}
    </section>
  )
}

function PriceChart({ market }) {
  const points = useMemo(() => {
    const result = []
    let value = market.price * 0.975
    for (let index = 0; index < 72; index += 1) {
      value += Math.sin(index * 0.52) * market.price * 0.0017 + (index % 7 - 2.4) * market.price * 0.00045
      result.push(value)
    }
    return result
  }, [market])
  const min = Math.min(...points)
  const max = Math.max(...points)
  const line = points.map((point, index) => `${(index / (points.length - 1)) * 1000},${260 - ((point - min) / (max - min)) * 210}`).join(' ')
  const area = `0,280 ${line} 1000,280`

  return (
    <section className="panel price-chart min-h-[390px] overflow-hidden">
      <div className="panel-title">
        <div className="flex items-center gap-4">
          <span>Chart</span>
          {['1m', '5m', '15m', '1H', '4H', '1D'].map((range) => <button key={range} className={`text-[11px] ${range === '1H' ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}`}>{range}</button>)}
        </div>
        <button className="text-slate-600 hover:text-slate-300"><BarChart3 size={15} /></button>
      </div>
      <div className="relative h-[330px] px-4 pb-4">
        <div className="absolute inset-4 grid grid-rows-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="border-t border-white/[0.035]" />)}
        </div>
        <svg viewBox="0 0 1000 280" preserveAspectRatio="none" className="relative h-full w-full">
          <defs>
            <linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity=".20" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#chartArea)" />
          <polyline points={line} fill="none" stroke="#fbbf24" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="absolute left-5 top-4 font-mono text-[11px] text-slate-600">O {formatPrice(points[0])} H {formatPrice(max)} L {formatPrice(min)} C {formatPrice(points.at(-1))}</div>
      </div>
    </section>
  )
}

function OrderBook({ market }) {
  const asks = useMemo(() => seedBook(market.price, 'ask').reverse(), [market])
  const bids = useMemo(() => seedBook(market.price, 'bid'), [market])
  const row = (item, side, index) => (
    <div key={`${side}-${index}`} className="relative grid grid-cols-3 px-3 py-[3px] font-mono text-[11px] hover:bg-white/[0.025]">
      <span className={`relative z-10 ${side === 'ask' ? 'text-rose-400' : 'text-emerald-400'}`}>{formatPrice(item.price)}</span>
      <span className="relative z-10 text-right text-slate-400">{item.amount.toFixed(5)}</span>
      <span className="relative z-10 text-right text-slate-600">{item.total.toFixed(2)}</span>
      <span className={`absolute inset-y-0 right-0 ${side === 'ask' ? 'bg-rose-500/[0.075]' : 'bg-emerald-500/[0.075]'}`} style={{ width: `${item.depth}%` }} />
    </div>
  )

  return (
    <section className="panel order-book min-h-[532px] overflow-hidden">
      <div className="panel-title"><span>Order Book</span><span className="text-[10px] text-slate-600">0.10</span></div>
      <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-slate-600"><span>Price (USDT)</span><span className="text-right">Amount ({market.base})</span><span className="text-right">Total</span></div>
      <div>{asks.map((item, index) => row(item, 'ask', index))}</div>
      <div className="flex items-center gap-2 px-3 py-2 font-mono text-sm font-semibold text-emerald-400">
        <ArrowUp size={14} /> {formatPrice(market.price)}
        <span className="ml-auto text-[10px] font-normal text-slate-600">Spread 0.01%</span>
      </div>
      <div>{bids.map((item, index) => row(item, 'bid', index))}</div>
    </section>
  )
}

function RecentTrades({ market, liveTrades = [] }) {
  const seededTrades = useMemo(() => seedTrades(market.price), [market])
  const trades = liveTrades.length ? liveTrades.map((trade, index) => ({
    id: trade.trade_id || index,
    price: Number(trade.price),
    amount: Number(trade.quantity),
    side: trade.side?.toLowerCase() || 'buy',
    time: trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString([], { hour12: false }) : '--:--:--',
  })) : seededTrades
  return (
    <section className="panel recent-trades overflow-hidden">
      <div className="panel-title"><span>Market Trades</span><Activity size={14} className="text-slate-600" /></div>
      <div className="grid grid-cols-3 px-3 py-2 text-[10px] text-slate-600"><span>Price (USDT)</span><span className="text-right">Amount ({market.base})</span><span className="text-right">Time</span></div>
      {trades.map((trade) => (
        <div key={trade.id} className="grid grid-cols-3 px-3 py-[4px] font-mono text-[11px] hover:bg-white/[0.025]">
          <span className={trade.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}>{formatPrice(trade.price)}</span>
          <span className="text-right text-slate-400">{trade.amount.toFixed(5)}</span>
          <span className="text-right text-slate-600">{trade.time}</span>
        </div>
      ))}
    </section>
  )
}

function OrderForm({ market, side, onAuthOpen, onOrderSubmitted, balances = {} }) {
  const { user } = useAuth()
  const [type, setType] = useState('Limit')
  const [price, setPrice] = useState(String(market.price))
  const [amount, setAmount] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const stepSize = market.stepSize || '0.000001'

  useEffect(() => setPrice(String(market.price)), [market])

  function applyPercent(percent) {
    const latestPrice = Number(price || market.price)
    if (side === 'BUY') {
      const quoteBalance = Number(balances.USDT || 0)
      if (!quoteBalance || !latestPrice) return setAmount('')
      return setAmount(floorToStep((quoteBalance * percent) / 100 / latestPrice, stepSize))
    }
    const baseBalance = Number(balances[market.base] || 0)
    return setAmount(floorToStep((baseBalance * percent) / 100, stepSize))
  }

  async function submit(event) {
    event.preventDefault()
    if (!user) return onAuthOpen()
    const cleanAmount = floorToStep(amount, stepSize)
    if (!cleanAmount || Number(cleanAmount) <= 0) return toast.error('Enter a valid amount')
    if (type === 'Stop' && (!stopPrice || Number(stopPrice) <= 0)) return toast.error('Enter a valid stop price')
    try {
      if (type === 'Market' && side === 'BUY') {
        await tradingService.placeMarketOrder(market.symbol, side, '0', String(Number(cleanAmount) * Number(price || market.price)))
      } else if (type === 'Market') await tradingService.placeMarketOrder(market.symbol, side, cleanAmount)
      else if (type === 'Stop') await tradingService.placeStopOrder(market.symbol, side, stopPrice, cleanAmount, price)
      else await tradingService.placeLimitOrder(market.symbol, side, price, cleanAmount)
      toast.success(`${side === 'BUY' ? 'Buy' : 'Sell'} order submitted`)
      setAmount('')
      onOrderSubmitted?.()
    } catch (error) {
      toast.error(error.message || 'Order could not be submitted')
    }
  }

  return (
    <form onSubmit={submit} className="flex-1 px-4 py-3">
      <div className="mb-4 flex gap-4 text-xs">
        {['Limit', 'Market', 'Stop'].map((item) => <button type="button" key={item} onClick={() => setType(item)} className={type === item ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}>{item}</button>)}
      </div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-600">
        <span>Available</span>
        <span>{side === 'BUY' ? `${balances.USDT || '0'} USDT` : `${balances[market.base] || '0'} ${market.base}`}</span>
      </div>
      {type === 'Stop' && <Field label="Stop" value={stopPrice} onChange={setStopPrice} suffix="USDT" />}
      {type !== 'Market' && <Field label="Price" value={price} onChange={setPrice} suffix="USDT" />}
      <Field label="Amount" value={amount} onChange={setAmount} suffix={market.base} />
      <div className="my-4 flex items-center gap-2">
        {[25, 50, 75, 100].map((value) => <button type="button" key={value} onClick={() => applyPercent(value)} className="flex-1 rounded bg-white/[0.035] py-1 text-[10px] text-slate-600 hover:bg-white/[0.07] hover:text-slate-300">{value}%</button>)}
      </div>
      <div className="mb-4 flex justify-between text-[11px] text-slate-600"><span>Total</span><span>{amount ? formatPrice(Number(amount) * Number(price)) : '0.00'} USDT</span></div>
      <button className={`w-full rounded-lg py-2.5 text-sm font-semibold text-white transition ${side === 'BUY' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-rose-500 hover:bg-rose-400'}`}>
        {user ? `${side === 'BUY' ? 'Buy' : 'Sell'} ${market.base}` : 'Log in to trade'}
      </button>
    </form>
  )
}

function Field({ label, value, onChange, suffix }) {
  return (
    <label className="mb-2 flex items-center rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2.5 focus-within:border-amber-400/30">
      <span className="w-14 text-[11px] text-slate-600">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 border-0 bg-transparent p-0 text-right font-mono text-xs text-slate-200 focus:ring-0" />
      <span className="ml-2 w-10 text-right text-[11px] text-slate-500">{suffix}</span>
    </label>
  )
}

function TradingPanel({ market, onAuthOpen, balances, onOrderSubmitted }) {
  return (
    <section className="panel trading-panel overflow-hidden">
      <div className="panel-title"><span>Spot</span><span className="flex items-center gap-1 text-[10px] text-emerald-400"><ShieldCheck size={12} /> Protected execution</span></div>
      <div className="flex divide-x divide-white/5">
        <OrderForm market={market} side="BUY" onAuthOpen={onAuthOpen} balances={balances} onOrderSubmitted={onOrderSubmitted} />
        <OrderForm market={market} side="SELL" onAuthOpen={onAuthOpen} balances={balances} onOrderSubmitted={onOrderSubmitted} />
      </div>
    </section>
  )
}

function OpenOrders({ orders = [], onCancel }) {
  return (
    <section className="panel open-orders min-h-[180px] overflow-hidden">
      <div className="panel-title justify-start gap-6">
        <button className="text-slate-200">Open Orders <span className="ml-1 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-600">{orders.length}</span></button>
        <button className="text-slate-600 hover:text-slate-300">Order History</button>
        <button className="text-slate-600 hover:text-slate-300">Trade History</button>
      </div>
      {orders.length ? <div>
        <div className="grid grid-cols-6 border-b border-white/5 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-600"><span>Pair</span><span>Side</span><span>Price</span><span>Quantity</span><span>Status</span><span /></div>
        {orders.map((order) => <div key={order.id} className="grid grid-cols-6 items-center border-b border-white/5 px-3 py-2 text-xs"><span>{order.pair}</span><span className={order.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{order.side}</span><span>{order.price || 'Market'}</span><span>{order.quantity}</span><span>{order.status}</span><button onClick={() => onCancel(order.id)} className="text-right text-rose-400">Cancel</button></div>)}
      </div> : <div className="grid h-32 place-items-center text-center">
        <div><BookOpen className="mx-auto mb-2 text-slate-700" size={22} /><div className="text-xs text-slate-500">No open orders</div><div className="mt-1 text-[11px] text-slate-700">Your active orders will appear here</div></div>
      </div>}
    </section>
  )
}

function AuthModal({ open, onClose }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('Password123!')
  const [busy, setBusy] = useState(false)
  if (!open) return null

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (mode === 'login') {
        toast.loading('Preparing your live demo workspace...', { id: 'auth-demo' })
        await login(email, password)
        toast.dismiss('auth-demo')
        toast.success('Welcome back')
        onClose()
      } else {
        toast.loading('Creating and funding your TradeOff account...', { id: 'auth-demo' })
        await register(email, password)
        toast.dismiss('auth-demo')
        toast.success('Account created. Welcome to TradeOff.')
        onClose()
      }
    } catch (error) {
      toast.error(error.message || 'Authentication failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#10141d] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">{mode === 'login' ? 'Welcome back' : 'Create your TradeOff account'}</h2><p className="mt-1 text-xs text-slate-500">Signup-first exchange simulator for your portfolio demo</p></div><button onClick={onClose} className="icon-button"><X size={17} /></button></div>
        <form onSubmit={submit}>
          <label className="auth-label">Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="auth-input" /></label>
          <label className="auth-label">Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="auth-input" /></label>
      <button disabled={busy} className="mt-2 w-full rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300 disabled:opacity-60">{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</button>
        </form>
        <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300">{mode === 'login' ? 'New to TradeOff? Create an account' : 'Already have an account? Log in'}</button>
      </div>
    </div>
  )
}

export default function Home() {
  const { user } = useAuth()
  const websocket = useWebSocket()
  const [selected, setSelected] = useState(MARKET_SEED[0])
  const [authOpen, setAuthOpen] = useState(false)
  const [liveTrades, setLiveTrades] = useState([])
  const [liveTickers, setLiveTickers] = useState({})
  const pairsQuery = useQuery({ queryKey: ['pairs'], queryFn: () => tradingService.getTradingPairs(), retry: 1 })
  const tickerQuery = useQuery({ queryKey: ['ticker', selected.symbol], queryFn: () => tradingService.getTicker(selected.symbol), retry: 1, refetchInterval: 5000 })
  const balancesQuery = useQuery({ queryKey: ['balances', user?.id], queryFn: () => walletService.getBalances(), enabled: !!user, retry: 1 })
  const ordersQuery = useQuery({ queryKey: ['open-orders', user?.id], queryFn: () => tradingService.getOrders({ status: 'OPEN', limit: 50 }), enabled: !!user, retry: 1 })

  const markets = useMemo(() => {
    const source = pairsQuery.data?.length
      ? pairsQuery.data.map((pair) => ({
          ...(MARKET_SEED.find((item) => item.symbol === pair.symbol) || { symbol: pair.symbol, base: pair.base_asset, price: 0, change: 0, volume: '0' }),
          base: pair.base_asset,
          stepSize: pair.step_size,
        }))
      : MARKET_SEED
    return source.map((marketItem) => {
      const live = liveTickers[marketItem.symbol]
      return live ? {
        ...marketItem,
        price: Number(live.price || marketItem.price),
        change: Number(live.change_pct_24h || marketItem.change || 0),
        volume: live.volume_24h && Number(live.volume_24h) > 0 ? Number(live.volume_24h).toLocaleString() : marketItem.volume,
      } : marketItem
    })
  }, [pairsQuery.data, liveTickers])

  const market = useMemo(() => {
    const selectedMarket = markets.find((item) => item.symbol === selected.symbol) || selected
    const live = liveTickers[selectedMarket.symbol]
    if (live) return { ...selectedMarket, price: Number(live.price), change: Number(live.change_pct_24h || selectedMarket.change || 0), volume: live.volume_24h || selectedMarket.volume }
    return tickerQuery.data?.price && Number(tickerQuery.data.price) > 0
      ? { ...selectedMarket, price: Number(tickerQuery.data.price), change: Number(tickerQuery.data.change_pct_24h || selectedMarket.change) }
      : selectedMarket
  }, [selected, markets, tickerQuery.data, liveTickers])
  const balances = useMemo(() => Object.fromEntries((balancesQuery.data?.balances || []).map((item) => [item.asset, item.available])), [balancesQuery.data])
  const { refetch: refetchTicker } = tickerQuery
  const { refetch: refetchPairs } = pairsQuery
  const { refetch: refetchBalances } = balancesQuery
  const { refetch: refetchOrders } = ordersQuery

  useEffect(() => {
    if (!websocket) return undefined
    return websocket.subscribe('market.tickers', (event) => {
      const updates = event.tickers || []
      setLiveTickers((current) => {
        const next = { ...current }
        updates.forEach((ticker) => {
          next[ticker.symbol] = ticker
        })
        return next
      })
    })
  }, [websocket])

  useEffect(() => {
    if (!websocket) return undefined
    const unsubscribeTrades = websocket.subscribe(`trades.${selected.symbol}`, (event) => {
      setLiveTrades((current) => [event, ...current].slice(0, 50))
      refetchTicker()
    })
    const unsubscribeDepth = websocket.subscribe(`orderbook.${selected.symbol}`, () => refetchTicker())
    return () => {
      unsubscribeTrades()
      unsubscribeDepth()
    }
  }, [selected.symbol, websocket, refetchTicker])

  useEffect(() => {
    if (!websocket || !user) return undefined
    const refreshPrivate = () => {
      refetchOrders()
      refetchBalances()
    }
    const unsubscribeOrders = websocket.subscribe(`orders.${user.id}`, refreshPrivate)
    const unsubscribeWallet = websocket.subscribe(`wallet.${user.id}`, refreshPrivate)
    return () => {
      unsubscribeOrders()
      unsubscribeWallet()
    }
  }, [user, websocket, refetchOrders, refetchBalances])

  useEffect(() => {
    if (!user) return
    refetchPairs()
    refetchTicker()
    refetchBalances()
  }, [user, refetchPairs, refetchTicker, refetchBalances])

  async function cancelOrder(orderId) {
    try {
      await tradingService.cancelOrder(orderId)
      toast.success('Order cancelled')
      refetchOrders()
      refetchBalances()
    } catch (error) {
      toast.error(error.message || 'Could not cancel order')
    }
  }

  function refreshPrivateData() {
    refetchOrders()
    refetchBalances()
  }

  return (
    <div className="exchange-app min-h-screen bg-[#070a0f] text-slate-300">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#171c26', color: '#e2e8f0', border: '1px solid rgba(255,255,255,.08)' } }} />
      <Header onAuthOpen={() => setAuthOpen(true)} />
      <div className="exchange-layout flex">
        <SideRail />
        <main className="exchange-main min-w-0 flex-1 p-2 lg:p-3">
          <div className="exchange-top-grid grid gap-2 xl:grid-cols-[245px_minmax(0,1fr)_290px]">
            <div className="hidden xl:block"><MarketSelector markets={markets} selected={market} onSelect={setSelected} /></div>
            <div className="min-w-0 space-y-2">
              <TickerStrip market={market} />
              <PriceChart market={market} />
            </div>
            <OrderBook market={market} />
          </div>
          <div className="exchange-bottom-grid mt-2 grid gap-2 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="space-y-2"><TradingPanel market={market} balances={balances} onAuthOpen={() => setAuthOpen(true)} onOrderSubmitted={refreshPrivateData} /><OpenOrders orders={ordersQuery.data?.orders || []} onCancel={cancelOrder} /></div>
            <RecentTrades market={market} liveTrades={liveTrades} />
          </div>
        </main>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
