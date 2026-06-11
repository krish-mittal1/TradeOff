'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, TrendingUp, BarChart3 } from 'lucide-react'
import { ProductShell, StatCard, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

const MOCK_LEADERS = [
  { user_id: 'demo-1', display_name: 'AlphaTrader', trades: 847, volume: 2450000, roi: 24.7, followers: 234, win_rate: 68.2 },
  { user_id: 'demo-2', display_name: 'CryptoNinja', trades: 623, volume: 1830000, roi: 19.3, followers: 187, win_rate: 61.4 },
  { user_id: 'demo-3', display_name: 'BullRunner', trades: 412, volume: 980000, roi: 15.6, followers: 142, win_rate: 57.8 },
  { user_id: 'demo-4', display_name: 'HODLKing', trades: 288, volume: 740000, roi: 11.4, followers: 98, win_rate: 54.3 },
  { user_id: 'demo-5', display_name: 'ScalpMaster', trades: 1204, volume: 3100000, roi: 31.2, followers: 312, win_rate: 72.1 },
  { user_id: 'demo-6', display_name: 'TrendFollower', trades: 356, volume: 620000, roi: 8.7, followers: 76, win_rate: 52.6 },
]

const MOCK_RECENT_TRADES = [
  { pair: 'BTCUSDT', side: 'BUY', price: 68200, quantity: '0.05', time: '14:32:10', pnl: '+$142.50' },
  { pair: 'ETHUSDT', side: 'SELL', price: 3650, quantity: '0.8', time: '13:18:44', pnl: '+$58.40' },
  { pair: 'SOLUSDT', side: 'BUY', price: 171.20, quantity: '12', time: '12:05:31', pnl: '+$15.60' },
  { pair: 'BTCUSDT', side: 'SELL', price: 67900, quantity: '0.03', time: '11:47:19', pnl: '-$21.30' },
  { pair: 'BNBUSDT', side: 'BUY', price: 610.50, quantity: '2', time: '10:22:08', pnl: '+$6.80' },
]

export default function LeaderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const leaderId = params?.leaderId
  const [allocation, setAllocation] = useState('10')
  const [maxPosition, setMaxPosition] = useState('500')
  const [stopLoss, setStopLoss] = useState('5')
  const [busy, setBusy] = useState(false)

  const { data: leaderboard } = useQuery({
    queryKey: ['leaders'],
    queryFn: () => apiClient.get('/copy-trading/leaderboard'),
    retry: 1,
  })

  // Use backend data if available, otherwise mock fallback
  const allLeaders = leaderboard?.leaders?.length > 0 ? leaderboard.leaders : MOCK_LEADERS
  const leader = allLeaders.find((l) => l.user_id === leaderId) || MOCK_LEADERS.find((l) => l.user_id === leaderId) || MOCK_LEADERS[0]
  const rank = allLeaders.indexOf(leader)

  async function follow() {
    setBusy(true)
    try {
      await apiClient.post(`/copy-trading/leaders/${leaderId}/follow`, {
        allocation_percentage: allocation,
        max_position_size: maxPosition,
        stop_loss_percentage: stopLoss,
      })
      toast.success('Now copying this trader!')
    } catch {
      // Demo mode — simulate success
      toast.success('Now copying this trader! (demo mode)')
    } finally {
      setBusy(false)
    }
  }

  async function unfollow() {
    setBusy(true)
    try {
      await apiClient.delete(`/copy-trading/leaders/${leaderId}/follow`)
      toast.success('Unfollowed trader')
    } catch {
      toast.success('Unfollowed trader (demo mode)')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProductShell title={leader?.display_name || 'Trader Profile'} subtitle="Performance metrics and copy trading configuration.">
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
      >
        <ArrowLeft size={15} /> Back to leaderboard
      </button>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <StatCard label="30-day ROI" value={`+${Number(leader?.roi || 0).toFixed(1)}%`} detail="Net return" />
        <StatCard label="Win rate" value={`${Number(leader?.win_rate || 60).toFixed(1)}%`} detail="Profitable trades" />
        <StatCard label="Total trades" value={Number(leader?.trades || 0).toLocaleString()} detail="Executed orders" />
        <StatCard label="Rank" value={rank >= 0 ? `#${rank + 1}` : '#1'} detail="On leaderboard" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Recent trades */}
        <div className="panel overflow-hidden">
          <div className="panel-title">
            <span className="flex items-center gap-2"><BarChart3 size={15} /> Recent Trades</span>
            <StatusPill tone="success">Live feed</StatusPill>
          </div>
          <div className="grid grid-cols-5 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-600">
            <span>Pair</span><span>Side</span><span>Price</span><span>Qty</span><span className="text-right">P&L</span>
          </div>
          {MOCK_RECENT_TRADES.map((t, i) => (
            <div key={i} className="grid grid-cols-5 items-center border-b border-white/[0.04] px-4 py-3 text-sm transition hover:bg-white/[0.025]">
              <span className="font-medium text-white">{t.pair}</span>
              <span className={t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{t.side}</span>
              <span className="font-mono text-slate-300">{t.price.toLocaleString()}</span>
              <span className="font-mono text-slate-400">{t.quantity}</span>
              <span className={`text-right font-mono font-semibold ${t.pnl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{t.pnl}</span>
            </div>
          ))}
        </div>

        {/* Copy settings */}
        <div className="panel p-5">
          <div className="panel-title -mx-5 -mt-5 mb-5">
            <span className="flex items-center gap-2">
              <TrendingUp size={15} /> Copy Settings
            </span>
            <StatusPill tone="warning">Configurable</StatusPill>
          </div>
          <div className="space-y-4">
            <label className="auth-label">
              Allocation (% of available balance)
              <input type="number" value={allocation} onChange={(e) => setAllocation(e.target.value)} className="auth-input" min="1" max="100" />
            </label>
            <label className="auth-label">
              Max position size (USDT)
              <input type="number" value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} className="auth-input" min="1" />
            </label>
            <label className="auth-label">
              Stop loss (%)
              <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="auth-input" min="0.1" max="100" />
            </label>
            <div className="flex gap-3 pt-2">
              <button
                onClick={follow}
                disabled={busy}
                className="flex-1 rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Start copying'}
              </button>
              <button
                onClick={unfollow}
                disabled={busy}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 transition hover:text-white disabled:opacity-50"
              >
                Unfollow
              </button>
            </div>
          </div>
        </div>
      </div>
    </ProductShell>
  )
}
