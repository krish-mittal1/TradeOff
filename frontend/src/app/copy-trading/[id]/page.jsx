'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ProductShell, StatCard, StatusPill, EmptyState } from '@/components/ProductShell'
import { ArrowLeft, TrendingUp, Users, BarChart3 } from 'lucide-react'

const MOCK_LEADER_DATA = {
  'demo-1': { display_name: 'AlphaTrader', trades: 847, volume: 2450000, roi: 24.7, followers: 234, win_rate: 68.2 },
  'demo-2': { display_name: 'CryptoNinja', trades: 623, volume: 1830000, roi: 19.3, followers: 187, win_rate: 61.4 },
  'demo-3': { display_name: 'BullRunner', trades: 412, volume: 980000, roi: 15.6, followers: 142, win_rate: 57.8 },
  'demo-4': { display_name: 'HODLKing', trades: 288, volume: 740000, roi: 11.4, followers: 98, win_rate: 54.3 },
  'demo-5': { display_name: 'ScalpMaster', trades: 1204, volume: 3100000, roi: 31.2, followers: 312, win_rate: 72.1 },
  'demo-6': { display_name: 'TrendFollower', trades: 356, volume: 620000, roi: 8.7, followers: 76, win_rate: 52.6 },
}

const MOCK_RECENT_TRADES = [
  { pair: 'BTCUSDT', side: 'BUY', price: 68200, quantity: '0.05', time: '14:32:10', pnl: '+$142.50' },
  { pair: 'ETHUSDT', side: 'SELL', price: 3650, quantity: '0.8', time: '13:18:44', pnl: '+$58.40' },
  { pair: 'SOLUSDT', side: 'BUY', price: 171.20, quantity: '12', time: '12:05:31', pnl: '+$15.60' },
  { pair: 'BTCUSDT', side: 'SELL', price: 67900, quantity: '0.03', time: '11:47:19', pnl: '-$21.30' },
  { pair: 'BNBUSDT', side: 'BUY', price: 610.50, quantity: '2', time: '10:22:08', pnl: '+$6.80' },
]

export default function CopyTraderPage() {
  const params = useParams()
  const traderId = params?.id || 'demo-1'
  const leader = MOCK_LEADER_DATA[traderId] || MOCK_LEADER_DATA['demo-1']

  return (
    <ProductShell title={leader.display_name} subtitle="Trader profile, performance metrics, and copy settings.">
      <Link href="/copy-trading" className="mb-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition">
        <ArrowLeft size={14} /> Back to Leaderboard
      </Link>

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <StatCard label="30-day ROI" value={`+${leader.roi.toFixed(1)}%`} detail="Net return" />
        <StatCard label="Win rate" value={`${leader.win_rate.toFixed(1)}%`} detail="Profitable trades" />
        <StatCard label="Total trades" value={leader.trades.toLocaleString()} detail="Executed orders" />
        <StatCard label="Followers" value={leader.followers} detail="Copying this trader" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel overflow-hidden">
          <div className="panel-title">
            <span>Recent Trades</span>
            <StatusPill tone="success">Live feed</StatusPill>
          </div>
          <div className="grid grid-cols-5 border-b border-white/5 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-600">
            <span>Pair</span><span>Side</span><span>Price</span><span>Quantity</span><span className="text-right">P&L</span>
          </div>
          {MOCK_RECENT_TRADES.map((t, i) => (
            <div key={i} className="grid grid-cols-5 items-center border-b border-white/5 px-4 py-3 text-sm">
              <span className="font-medium text-white">{t.pair}</span>
              <span className={t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>{t.side}</span>
              <span className="font-mono text-slate-300">{t.price.toLocaleString()}</span>
              <span className="font-mono text-slate-400">{t.quantity}</span>
              <span className={`text-right font-mono font-semibold ${t.pnl.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{t.pnl}</span>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <div className="panel-title -mx-5 -mt-5 mb-4">
              <span className="flex items-center gap-2"><Users size={15} /> Copy Settings</span>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs text-slate-500">Allocation per trade</label>
                <input
                  type="number"
                  defaultValue="100"
                  className="auth-input mt-1"
                  placeholder="USDT"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Max open positions</label>
                <input
                  type="number"
                  defaultValue="5"
                  className="auth-input mt-1"
                  placeholder="5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Stop-loss %</label>
                <input
                  type="number"
                  defaultValue="10"
                  className="auth-input mt-1"
                  placeholder="10%"
                />
              </div>
              <button className="mt-2 w-full rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-black hover:bg-amber-300 transition">
                Start Copying
              </button>
              <p className="text-[11px] text-slate-600 text-center">
                Demo mode — copy trading simulation only
              </p>
            </div>
          </div>
          <div className="panel p-4 text-xs text-slate-500">
            <div className="mb-2 font-semibold text-slate-400 flex items-center gap-1.5">
              <BarChart3 size={13} /> Performance Summary
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><span>Best month</span><span className="text-emerald-400">+{(leader.roi * 1.4).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span>Worst month</span><span className="text-rose-400">-{(leader.roi * 0.3).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span>Avg trade duration</span><span className="text-slate-300">4.2h</span></div>
              <div className="flex justify-between"><span>Volume traded</span><span className="text-slate-300">${(leader.volume / 1e6).toFixed(1)}M</span></div>
            </div>
          </div>
        </div>
      </div>
    </ProductShell>
  )
}
