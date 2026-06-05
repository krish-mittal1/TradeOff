'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { ProductShell, StatCard, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

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
  const leader = leaderboard?.leaders?.find((l) => l.user_id === leaderId)

  async function follow() {
    setBusy(true)
    try {
      await apiClient.post(`/copy-trading/leaders/${leaderId}/follow`, {
        allocation_percentage: allocation,
        max_position_size: maxPosition,
        stop_loss_percentage: stopLoss,
      })
      toast.success('Now copying this trader')
    } catch (error) {
      toast.error(error.message || 'Could not follow trader')
    } finally {
      setBusy(false)
    }
  }

  async function unfollow() {
    setBusy(true)
    try {
      await apiClient.delete(`/copy-trading/leaders/${leaderId}/follow`)
      toast.success('Unfollowed trader')
    } catch (error) {
      toast.error(error.message || 'Could not unfollow')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ProductShell
      title={leader?.display_name || 'Leader Profile'}
      subtitle="Configure copy trading settings for this trader."
    >
      <button
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft size={16} /> Back to leaderboard
      </button>
      {leader ? (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <StatCard label="Total trades" value={leader.trades} detail="Executed orders" />
            <StatCard
              label="Volume"
              value={`$${Number(leader.volume).toLocaleString()}`}
              detail="Total quote volume"
            />
            <StatCard label="Rank" value={`#${(leaderboard?.leaders?.indexOf(leader) ?? 0) + 1}`} detail="On leaderboard" />
          </div>
          <div className="panel p-5 max-w-lg">
            <div className="panel-title -mx-5 -mt-5 mb-5">
              <span className="flex items-center gap-2">
                <TrendingUp size={15} /> Copy Settings
              </span>
              <StatusPill tone="warning">Configurable</StatusPill>
            </div>
            <label className="auth-label">
              Allocation (% of available balance)
              <input
                type="number"
                value={allocation}
                onChange={(e) => setAllocation(e.target.value)}
                className="auth-input"
                min="1"
                max="100"
              />
            </label>
            <label className="auth-label mt-3">
              Max position size (USDT)
              <input
                type="number"
                value={maxPosition}
                onChange={(e) => setMaxPosition(e.target.value)}
                className="auth-input"
                min="1"
              />
            </label>
            <label className="auth-label mt-3">
              Stop loss (%)
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="auth-input"
                min="0.1"
                max="100"
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                onClick={follow}
                disabled={busy}
                className="flex-1 rounded-lg bg-amber-400 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Start copying'}
              </button>
              <button
                onClick={unfollow}
                disabled={busy}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-50"
              >
                Unfollow
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-500">Leader not found or data is loading.</div>
      )}
    </ProductShell>
  )
}
