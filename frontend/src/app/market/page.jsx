'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { TrendingUp, TrendingDown, BarChart2 } from 'lucide-react'
import { ProductShell, EmptyState, StatCard } from '@/components/ProductShell'
import { tradingService } from '@/services/tradingService'

export default function MarketPage() {
  const pairsQuery = useQuery({
    queryKey: ['market-pairs'],
    queryFn: () => tradingService.getTradingPairs(),
    retry: 1,
  })
  const tickersQuery = useQuery({
    queryKey: ['market-tickers'],
    queryFn: () => tradingService.getTradingPairs().then(async (pairs) => {
      // getTickers returns all tickers
      try {
        const { apiClient } = await import('@/services/api')
        return apiClient.get('/market/tickers')
      } catch {
        return []
      }
    }),
    refetchInterval: 10000,
    retry: 1,
  })

  const pairs = pairsQuery.data || []
  const tickers = Array.isArray(tickersQuery.data) ? tickersQuery.data : []

  const tickerMap = Object.fromEntries(tickers.map((t) => [t.symbol, t]))

  return (
    <ProductShell title="Markets" subtitle="All active trading pairs with live prices and 24h stats.">
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <StatCard label="Active pairs" value={pairs.length} detail="Listed on this exchange" />
        <StatCard
          label="Top gainer"
          value={pairs.length ? (pairs[0]?.symbol || '-') : '-'}
          detail="By 24h volume"
        />
        <StatCard label="Status" value="Live" detail="Real-time market data" />
      </div>
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-5 border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-slate-600">
          <span>Pair</span>
          <span className="text-right">Last price</span>
          <span className="text-right">Best bid</span>
          <span className="text-right">Best ask</span>
          <span className="text-right">Action</span>
        </div>
        {pairs.length ? (
          pairs.map((pair) => {
            const ticker = tickerMap[pair.symbol] || {}
            const price = Number(ticker.price || 0)
            return (
              <div
                key={pair.symbol}
                className="asset-row grid grid-cols-5 items-center border-b border-white/5 px-4 py-4 text-sm"
              >
                <span className="font-medium text-white">
                  {pair.base_asset}
                  <span className="text-slate-500">/{pair.quote_asset}</span>
                </span>
                <span className="text-right font-mono text-slate-300">
                  {price > 0 ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : '—'}
                </span>
                <span className="text-right font-mono text-emerald-400">
                  {Number(ticker.best_bid || 0) > 0
                    ? Number(ticker.best_bid).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
                    : '—'}
                </span>
                <span className="text-right font-mono text-rose-400">
                  {Number(ticker.best_ask || 0) > 0
                    ? Number(ticker.best_ask).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })
                    : '—'}
                </span>
                <span className="text-right">
                  <Link
                    href={`/`}
                    className="rounded-lg bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20"
                  >
                    Trade
                  </Link>
                </span>
              </div>
            )
          })
        ) : (
          <EmptyState>
            No trading pairs found. Run the demo bootstrap to seed the exchange.
          </EmptyState>
        )}
      </div>
    </ProductShell>
  )
}
