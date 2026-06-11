'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Search, BarChart3 } from 'lucide-react'
import { ProductShell, EmptyState, StatCard } from '@/components/ProductShell'
import { tradingService } from '@/services/tradingService'

const MARKET_SEED = [
  { symbol: 'BTCUSDT', base_asset: 'BTC', quote_asset: 'USDT', price: 68429.12, change: 2.84, volume: '1.42B', high: 69800, low: 67100 },
  { symbol: 'ETHUSDT', base_asset: 'ETH', quote_asset: 'USDT', price: 3641.87, change: 1.92, volume: '824.6M', high: 3720, low: 3580 },
  { symbol: 'BNBUSDT', base_asset: 'BNB', quote_asset: 'USDT', price: 612.40, change: 0.84, volume: '412.1M', high: 625, low: 608 },
  { symbol: 'SOLUSDT', base_asset: 'SOL', quote_asset: 'USDT', price: 172.46, change: -0.74, volume: '318.2M', high: 178, low: 170 },
  { symbol: 'XRPUSDT', base_asset: 'XRP', quote_asset: 'USDT', price: 0.6245, change: 1.18, volume: '689.4M', high: 0.64, low: 0.61 },
  { symbol: 'ADAUSDT', base_asset: 'ADA', quote_asset: 'USDT', price: 0.4518, change: 4.11, volume: '91.8M', high: 0.47, low: 0.43 },
  { symbol: 'DOGEUSDT', base_asset: 'DOGE', quote_asset: 'USDT', price: 0.1682, change: -1.03, volume: '211.5M', high: 0.175, low: 0.163 },
  { symbol: 'AVAXUSDT', base_asset: 'AVAX', quote_asset: 'USDT', price: 41.28, change: 2.06, volume: '122.7M', high: 42.5, low: 40.2 },
  { symbol: 'LINKUSDT', base_asset: 'LINK', quote_asset: 'USDT', price: 18.74, change: 0.58, volume: '98.4M', high: 19.1, low: 18.5 },
  { symbol: 'DOTUSDT', base_asset: 'DOT', quote_asset: 'USDT', price: 7.35, change: -0.22, volume: '76.2M', high: 7.55, low: 7.20 },
  { symbol: 'MATICUSDT', base_asset: 'MATIC', quote_asset: 'USDT', price: 0.7124, change: 1.47, volume: '64.9M', high: 0.73, low: 0.70 },
  { symbol: 'LTCUSDT', base_asset: 'LTC', quote_asset: 'USDT', price: 84.50, change: 0.31, volume: '54.1M', high: 86.0, low: 83.5 },
]

function MiniSparkline({ change }) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const y = 20 - Math.sin(i * 0.8) * 8 - (change > 0 ? i * 0.5 : -i * 0.5)
    return `${(i / 11) * 60},${y}`
  }).join(' ')
  return (
    <svg viewBox="0 0 60 40" className="h-8 w-14">
      <polyline
        points={points}
        fill="none"
        stroke={change >= 0 ? '#10b981' : '#ef4444'}
        strokeWidth="1.5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export default function MarketPage() {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('volume')

  const pairsQuery = useQuery({
    queryKey: ['market-pairs'],
    queryFn: () => tradingService.getTradingPairs(),
    retry: 1,
  })

  const tickersQuery = useQuery({
    queryKey: ['market-tickers-all'],
    queryFn: async () => {
      try {
        const { apiClient } = await import('@/services/api')
        return apiClient.get('/market/tickers')
      } catch {
        return []
      }
    },
    refetchInterval: 10000,
    retry: 1,
  })

  const backendPairs = pairsQuery.data || []
  const tickers = Array.isArray(tickersQuery.data) ? tickersQuery.data : []
  const tickerMap = Object.fromEntries(tickers.map((t) => [t.symbol, t]))

  // Merge backend pairs with seed data
  const pairs = backendPairs.length > 0
    ? backendPairs.map((pair) => {
        const seed = MARKET_SEED.find((s) => s.symbol === pair.symbol)
        const ticker = tickerMap[pair.symbol] || {}
        return {
          ...pair,
          price: Number(ticker.price || seed?.price || 0),
          change: Number(ticker.change_pct_24h || seed?.change || 0),
          volume: ticker.volume_24h || seed?.volume || '0',
          high: Number(ticker.high_24h || seed?.high || 0),
          low: Number(ticker.low_24h || seed?.low || 0),
          best_bid: Number(ticker.best_bid || 0),
          best_ask: Number(ticker.best_ask || 0),
        }
      })
    : MARKET_SEED.map((s) => ({
        ...s,
        best_bid: s.price * 0.9999,
        best_ask: s.price * 1.0001,
        is_active: true,
        min_qty: '0.001',
        maker_fee: 0.001,
      }))

  const filtered = pairs
    .filter((p) => p.symbol.toLowerCase().includes(query.toLowerCase()) || p.base_asset?.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === 'change' ? b.change - a.change : String(b.volume).localeCompare(String(a.volume), undefined, { numeric: true }))

  const gainers = [...pairs].sort((a, b) => b.change - a.change).slice(0, 3)
  const losers = [...pairs].sort((a, b) => a.change - b.change).slice(0, 3)

  function fmtPrice(v) {
    const n = Number(v || 0)
    if (n === 0) return '—'
    return n >= 100 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  }

  return (
    <ProductShell title="Markets" subtitle="All active trading pairs with live prices and 24h stats.">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <StatCard label="Active pairs" value={pairs.length} detail="Listed on this exchange" />
        <StatCard
          label="Top gainer"
          value={gainers[0] ? `${gainers[0].base_asset} +${Number(gainers[0].change).toFixed(2)}%` : '—'}
          detail="Best 24h performance"
        />
        <StatCard
          label="Top loser"
          value={losers[0] ? `${losers[0].base_asset} ${Number(losers[0].change).toFixed(2)}%` : '—'}
          detail="Worst 24h performance"
        />
      </div>

      {/* Search + sort bar */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2 text-sm text-slate-500">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pair or asset…"
            className="w-full border-0 bg-transparent p-0 text-sm text-slate-200 placeholder:text-slate-600 focus:ring-0"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-white/5 bg-white/[0.035] p-1 text-xs">
          <button onClick={() => setSort('volume')} className={`rounded-lg px-3 py-1.5 transition ${sort === 'volume' ? 'bg-amber-400/10 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
            Volume
          </button>
          <button onClick={() => setSort('change')} className={`rounded-lg px-3 py-1.5 transition ${sort === 'change' ? 'bg-amber-400/10 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
            Change
          </button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.7fr_0.8fr] border-b border-white/5 px-4 py-3 text-[10px] uppercase tracking-wider text-slate-600">
          <span>Pair</span>
          <span className="text-right">Last price</span>
          <span className="text-right">24h Change</span>
          <span className="text-right">24h Volume</span>
          <span className="text-center">Trend</span>
          <span className="text-right">Action</span>
        </div>
        {filtered.length ? (
          filtered.map((pair) => {
            const isUp = Number(pair.change) >= 0
            return (
              <div
                key={pair.symbol}
                className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.7fr_0.8fr] items-center border-b border-white/[0.04] px-4 py-3 transition hover:bg-white/[0.025]"
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.04] text-[10px] font-bold text-slate-300">
                    {pair.base_asset?.slice(0, 2)}
                  </span>
                  <span>
                    <span className="font-medium text-white">{pair.base_asset}</span>
                    <span className="text-slate-500">/{pair.quote_asset || 'USDT'}</span>
                  </span>
                </span>
                <span className="text-right font-mono text-slate-300">{fmtPrice(pair.price)}</span>
                <span className={`text-right font-mono font-semibold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isUp ? '+' : ''}{Number(pair.change).toFixed(2)}%
                </span>
                <span className="text-right font-mono text-slate-500">{pair.volume}</span>
                <span className="flex justify-center">
                  <MiniSparkline change={Number(pair.change)} />
                </span>
                <span className="text-right">
                  <Link
                    href="/"
                    className="inline-block rounded-lg bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/20"
                  >
                    Trade
                  </Link>
                </span>
              </div>
            )
          })
        ) : (
          <EmptyState>No trading pairs match your search.</EmptyState>
        )}
      </div>
    </ProductShell>
  )
}
