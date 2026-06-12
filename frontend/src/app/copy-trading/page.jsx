'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ProductShell, EmptyState } from '@/components/ProductShell'
import { apiClient } from '@/services/api'
import { TrendingUp, Users, Star } from 'lucide-react'

const MOCK_LEADERS = [
  { user_id: 'demo-1', display_name: 'AlphaTrader', trades: 847, volume: 2450000, pnl: 18.4, roi: 24.7, followers: 234 },
  { user_id: 'demo-2', display_name: 'CryptoNinja', trades: 623, volume: 1830000, pnl: 12.1, roi: 19.3, followers: 187 },
  { user_id: 'demo-3', display_name: 'BullRunner', trades: 412, volume: 980000, pnl: 9.8, roi: 15.6, followers: 142 },
  { user_id: 'demo-4', display_name: 'HODLKing', trades: 288, volume: 740000, pnl: 7.2, roi: 11.4, followers: 98 },
  { user_id: 'demo-5', display_name: 'ScalpMaster', trades: 1204, volume: 3100000, pnl: 22.6, roi: 31.2, followers: 312 },
  { user_id: 'demo-6', display_name: 'TrendFollower', trades: 356, volume: 620000, pnl: 5.9, roi: 8.7, followers: 76 },
]

function LeaderCard({ leader, rank }) {
  const rankColors = ['text-amber-400', 'text-slate-300', 'text-amber-700']
  const rankBg = ['bg-amber-400/10', 'bg-slate-400/10', 'bg-amber-700/10']
  return (
    <div className="panel p-5 flex flex-col gap-4 hover:border-amber-400/20 transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${rankBg[rank] || 'bg-white/5'} ${rankColors[rank] || 'text-slate-400'}`}>
            #{rank + 1}
          </span>
          <div>
            <div className="text-sm font-semibold text-white">{leader.display_name || 'Trader'}</div>
            <div className="text-[11px] text-slate-500">{leader.followers || 0} followers</div>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-400">
          <TrendingUp size={11} /> ACTIVE
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-white/[0.025] p-3">
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">ROI</div>
          <div className="mt-1 text-sm font-bold text-emerald-400">+{((leader.roi ?? leader.pnl) || 0).toFixed(1)}%</div>
        </div>
        <div className="text-center border-x border-white/5">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Trades</div>
          <div className="mt-1 text-sm font-bold text-white">{leader.trades?.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Volume</div>
          <div className="mt-1 text-sm font-bold text-white">${(Number(leader.volume) / 1e6).toFixed(1)}M</div>
        </div>
      </div>

      <Link
        href={`/copy-trading/${leader.user_id}`}
        className="block w-full rounded-xl bg-amber-400 py-2.5 text-center text-xs font-bold text-black transition hover:bg-amber-300"
      >
        Follow Trader
      </Link>
    </div>
  )
}

export default function CopyTradingPage() {
  const { data } = useQuery({
    queryKey: ['leaders'],
    queryFn: () => apiClient.get('/copy-trading/leaderboard'),
    retry: 1,
  })

  const backendLeaders = data?.leaders || []
  const leaders = backendLeaders.length > 0 ? backendLeaders : MOCK_LEADERS

  const topByRoi = [...leaders].sort((a, b) => (b.roi || b.pnl || 0) - (a.roi || a.pnl || 0))

  return (
    <ProductShell title="Copy Trading" subtitle="Discover top performers and replicate their trades automatically.">
      {/* Stats bar */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Top Trader ROI</div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">+{((topByRoi[0]?.roi ?? topByRoi[0]?.pnl) || 0).toFixed(1)}%</div>
          <div className="mt-1 text-xs text-slate-600">30-day performance</div>
        </div>
        <div className="panel p-4">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Active Leaders</div>
          <div className="mt-2 text-2xl font-bold text-white">{leaders.length}</div>
          <div className="mt-1 text-xs text-slate-600">Trading today</div>
        </div>
        <div className="panel p-4">
          <div className="text-[11px] uppercase tracking-widest text-slate-500">Total Followers</div>
          <div className="mt-2 text-2xl font-bold text-white">
            {leaders.reduce((s, l) => s + (l.followers || 0), 0).toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-600">Copying strategies</div>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 text-sm">
        <Star size={14} className="text-amber-400" />
        <span className="font-medium text-white">Top Performers</span>
        <span className="ml-1 text-xs text-slate-500">by 30-day ROI</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topByRoi.map((leader, i) => (
          <LeaderCard key={leader.user_id} leader={leader} rank={i} />
        ))}
      </div>
    </ProductShell>
  )
}
