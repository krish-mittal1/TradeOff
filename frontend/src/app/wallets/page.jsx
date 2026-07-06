'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDownToLine, ArrowUpFromLine, Copy, RefreshCw, Wallet } from 'lucide-react'
import { ProductShell, EmptyState, StatusPill, StatCard, LoginGate } from '@/components/ProductShell'
import { walletService } from '@/services/walletService'
import { useAuth } from '@/providers/AuthProvider'

export default function WalletsPage() {
  const { user } = useAuth()
  const [asset, setAsset] = useState('USDT')
  const [depositAmount, setDepositAmount] = useState('1000')
  const [withdrawAmount, setWithdrawAmount] = useState('100')
  const [address, setAddress] = useState('')

  const balancesQuery  = useQuery({ queryKey: ['balances'],          queryFn: () => walletService.getBalances(),              retry: 1, enabled: !!user })
  const depositsQuery  = useQuery({ queryKey: ['deposits'],          queryFn: () => walletService.getDeposits(),              retry: 1, enabled: !!user })
  const withdrawalsQuery = useQuery({ queryKey: ['withdrawals'],     queryFn: () => walletService.getWithdrawals(),           retry: 1, enabled: !!user })
  const addressQuery   = useQuery({ queryKey: ['deposit-address', asset], queryFn: () => walletService.getDepositAddress(asset), retry: 1, enabled: !!user })

  const balances     = balancesQuery.data?.balances || []
  const totalAssets  = balances.length
  const lockedAssets = balances.filter((b) => Number(b.locked || 0) > 0).length

  async function createDeposit() {
    try {
      await walletService.createMockDeposit(asset, depositAmount)
      toast.success('Mock deposit created — funds will appear in your balance')
      depositsQuery.refetch()
      balancesQuery.refetch()
    } catch (err) {
      toast.error(err.message || 'Could not create deposit')
    }
  }

  async function confirmDeposit(id) {
    try {
      await walletService.confirmDeposit(id)
      toast.success('Deposit confirmed')
      balancesQuery.refetch()
      depositsQuery.refetch()
    } catch (err) {
      toast.error(err.message || 'Could not confirm deposit')
    }
  }

  async function withdraw() {
    if (!address.trim()) return toast.error('Enter a recipient wallet address')
    if (!withdrawAmount || Number(withdrawAmount) <= 0) return toast.error('Enter a valid amount')
    try {
      await walletService.createWithdrawal(asset, address, withdrawAmount)
      toast.success('Withdrawal requested')
      balancesQuery.refetch()
      withdrawalsQuery.refetch()
    } catch (err) {
      toast.error(err.message || 'Could not request withdrawal')
    }
  }

  async function cancelWithdrawal(id) {
    try {
      await walletService.cancelWithdrawal(id)
      toast.success('Withdrawal cancelled')
      balancesQuery.refetch()
      withdrawalsQuery.refetch()
    } catch (err) {
      toast.error(err.message || 'Could not cancel withdrawal')
    }
  }

  function refreshAll() {
    balancesQuery.refetch()
    depositsQuery.refetch()
    withdrawalsQuery.refetch()
    addressQuery.refetch()
  }

  return (
    <ProductShell
      title="Wallets"
      subtitle="Manage your practice balances — deposit virtual funds to start trading."
    >
      {/* Auth gate */}
      {!user ? (
        <div className="space-y-4">
          <LoginGate
            icon={Wallet}
            message="Sign in to view and manage your virtual wallet balances. You can deposit free practice funds instantly."
          />
          {/* Explain what wallets are for beginners */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { title: 'What is a wallet?', desc: 'Your wallet holds your practice balances — USDT (stablecoins) and crypto assets you buy.' },
              { title: 'What is USDT?', desc: 'USDT is a stablecoin pegged to the US dollar. You use it to buy crypto on this exchange.' },
              { title: 'Is it real money?', desc: 'No! TradeOff is a paper trading simulator. All deposits and trades use virtual money.' },
            ].map(({ title, desc }) => (
              <div key={title} className="panel p-5">
                <div className="mb-2 font-semibold text-sm" style={{ color: 'var(--t-text)' }}>{title}</div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--t-text3)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <StatCard label="Assets held" value={totalAssets} detail="Different coins / tokens in your wallet" />
            <StatCard label="Locked in orders" value={lockedAssets} detail="Reserved for open buy/sell orders" />
            <button onClick={refreshAll} className="panel flex items-center justify-between p-5 text-left hover:border-amber-400/30 transition">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t-text3)' }}>Refresh</span>
                <span className="mt-2 block text-xl font-semibold" style={{ color: 'var(--t-text)' }}>Sync wallet</span>
              </span>
              <RefreshCw size={20} className="text-amber-400" />
            </button>
          </div>

          {/* Help banner */}
          <div className="mb-4 rounded-xl border border-blue-400/20 bg-blue-400/[0.06] px-4 py-3 text-sm text-blue-300">
            <strong>New here?</strong> Use the <em>Mock Deposit</em> form below to add virtual USDT to your account, then go to{' '}
            <a href="/" className="underline hover:no-underline">Trade</a> to buy crypto.
          </div>

          {/* Deposit & Withdraw */}
          <div className="mb-4 grid gap-3 lg:grid-cols-2">
            {/* Deposit */}
            <div className="panel p-5">
              <div className="panel-title -mx-5 -mt-5 mb-4">
                <span className="flex items-center gap-2">
                  <ArrowDownToLine size={15} className="text-emerald-400" />
                  Add funds (mock deposit)
                </span>
                <StatusPill tone="success">Instant — free</StatusPill>
              </div>
              <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--t-text3)' }}>
                Add virtual money to your account. Enter USDT to get stablecoins, or any crypto symbol to deposit that asset.
              </p>
              <div className="mb-3 rounded-xl border bg-white/[0.02] p-3" style={{ borderColor: 'var(--t-border)' }}>
                <div className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: 'var(--t-text3)' }}>
                  <Copy size={12} /> Your deposit address
                </div>
                <div className="break-all font-mono text-sm" style={{ color: 'var(--t-text)' }}>
                  {addressQuery.data?.address || <span className="italic opacity-50">Loading address…</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={asset}
                  onChange={(e) => setAsset(e.target.value.toUpperCase())}
                  className="auth-input mt-0 w-24"
                  placeholder="Asset"
                />
                <input
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="auth-input mt-0 flex-1"
                  placeholder="Amount (e.g. 1000)"
                  type="number"
                  min="0"
                />
                <button
                  onClick={createDeposit}
                  className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 transition"
                >
                  Deposit
                </button>
              </div>
            </div>

            {/* Withdraw */}
            <div className="panel p-5">
              <div className="panel-title -mx-5 -mt-5 mb-4">
                <span className="flex items-center gap-2">
                  <ArrowUpFromLine size={15} className="text-rose-400" />
                  Withdraw funds
                </span>
                <StatusPill tone="warning">Requires approval</StatusPill>
              </div>
              <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--t-text3)' }}>
                Request a withdrawal to an external wallet address. In this simulator, withdrawals are processed instantly in the approval queue.
              </p>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={asset}
                    onChange={(e) => setAsset(e.target.value.toUpperCase())}
                    className="auth-input mt-0 w-24"
                    placeholder="Asset"
                  />
                  <input
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="auth-input mt-0 flex-1"
                    placeholder="Amount"
                    type="number"
                    min="0"
                  />
                </div>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="auth-input mt-0 w-full"
                  placeholder="Recipient wallet address (e.g. 0x1234…)"
                />
                <button
                  onClick={withdraw}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 transition"
                >
                  Request withdrawal
                </button>
              </div>
            </div>
          </div>

          {/* Balances table */}
          <div className="panel overflow-hidden mb-4">
            <div className="panel-title">
              Your balances
              <span className="text-[10px] font-normal" style={{ color: 'var(--t-text3)' }}>
                Available = free to trade · Locked = in open orders
              </span>
            </div>
            <div
              className="grid grid-cols-4 border-b px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ borderColor: 'var(--t-border)', color: 'var(--t-text3)' }}
            >
              <span>Asset</span>
              <span className="text-right">Available</span>
              <span className="text-right">Locked</span>
              <span className="text-right">Total</span>
            </div>
            {balancesQuery.isLoading ? (
              <div className="p-6 space-y-2">
                {[1,2,3].map((i) => (
                  <div key={i} className="h-8 animate-pulse rounded" style={{ background: 'var(--t-hover)' }} />
                ))}
              </div>
            ) : balances.length ? (
              balances.map((item) => (
                <div
                  key={item.asset}
                  className="asset-row grid grid-cols-4 border-b px-4 py-3.5 text-sm"
                  style={{ borderColor: 'var(--t-border)' }}
                >
                  <span>
                    <span className="font-semibold" style={{ color: 'var(--t-text)' }}>{item.asset}</span>
                    <span className="ml-1.5 text-xs" style={{ color: 'var(--t-text3)' }}>{item.asset_name}</span>
                  </span>
                  <span className="text-right font-mono" style={{ color: 'var(--t-text)' }}>{item.available}</span>
                  <span className="text-right font-mono text-amber-400">{item.locked}</span>
                  <span className="text-right font-mono" style={{ color: 'var(--t-text)' }}>{item.total}</span>
                </div>
              ))
            ) : (
              <EmptyState icon={Wallet}>
                No balances yet. Use the deposit form above to add virtual USDT.
              </EmptyState>
            )}
          </div>

          {/* History */}
          <div className="grid gap-4 lg:grid-cols-2">
            <HistoryPanel title="Deposit history" rows={depositsQuery.data?.deposits || []} actionLabel="Confirm" onAction={confirmDeposit} loading={depositsQuery.isLoading} />
            <HistoryPanel title="Withdrawal history" rows={withdrawalsQuery.data?.withdrawals || []} actionLabel="Cancel" onAction={cancelWithdrawal} loading={withdrawalsQuery.isLoading} />
          </div>
        </>
      )}
    </ProductShell>
  )
}

function HistoryPanel({ title, rows, actionLabel, onAction, loading }) {
  return (
    <div className="panel overflow-hidden">
      <div className="panel-title">{title}</div>
      {loading ? (
        <div className="p-4 space-y-2">
          {[1,2].map((i) => <div key={i} className="h-8 animate-pulse rounded" style={{ background: 'var(--t-hover)' }} />)}
        </div>
      ) : rows.length ? (
        rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[1fr_0.7fr_0.8fr_auto] items-center gap-2 border-b px-4 py-3 text-xs" style={{ borderColor: 'var(--t-border)' }}>
            <span className="truncate" style={{ color: 'var(--t-text2)' }}>
              {row.asset && <span className="mr-1.5 font-bold text-amber-400">{row.asset}</span>}
              <span className="font-mono opacity-60">{row.tx_hash || row.address || row.id}</span>
            </span>
            <span className="font-mono" style={{ color: 'var(--t-text)' }}>{row.amount}</span>
            <StatusPill tone={row.status === 'COMPLETED' ? 'success' : row.status === 'FAILED' || row.status === 'CANCELLED' ? 'danger' : 'warning'}>
              {row.status}
            </StatusPill>
            {actionLabel && row.status !== 'COMPLETED' ? (
              <button onClick={() => onAction(row.id)} className="rounded bg-white/5 px-2 py-1 text-amber-400 hover:bg-white/10 transition">
                {actionLabel}
              </button>
            ) : <span />}
          </div>
        ))
      ) : (
        <EmptyState>No {title.toLowerCase()} yet.</EmptyState>
      )}
    </div>
  )
}
