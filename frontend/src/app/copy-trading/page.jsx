'use client'

import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ProductShell, EmptyState } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function CopyTradingPage() {
  const { data } = useQuery({ queryKey: ['leaders'], queryFn: () => apiClient.get('/copy-trading/leaderboard'), retry: 1 })
  const leaders = data?.leaders || []

  async function follow(leaderId) {
    try {
      await apiClient.post(`/copy-trading/leaders/${leaderId}/follow`, {
        allocation_percentage: '10',
        max_position_size: '500',
        stop_loss_percentage: '5',
      })
      toast.success('Copy trading enabled for leader')
    } catch (error) {
      toast.error(error.message || 'Could not follow leader')
    }
  }

  return <ProductShell title="Copy Trading" subtitle="Discover leaders and replicate trades within your own risk limits.">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {leaders.length ? leaders.map((leader, index) => <div key={leader.user_id} className="panel p-5"><div className="flex items-center justify-between"><span className="text-sm font-medium text-white">#{index + 1} {leader.display_name || 'Trader'}</span><span className="rounded bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-400">ACTIVE</span></div><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div><div className="text-slate-600">Trades</div><div className="mt-1 text-white">{leader.trades}</div></div><div><div className="text-slate-600">Volume</div><div className="mt-1 text-white">${Number(leader.volume).toLocaleString()}</div></div></div><button onClick={() => follow(leader.user_id)} className="mt-5 w-full rounded-lg bg-amber-400 py-2 text-xs font-semibold text-black">Follow trader</button></div>) : <EmptyState>Leaderboard data will appear after traders execute orders.</EmptyState>}
    </div>
  </ProductShell>
}
