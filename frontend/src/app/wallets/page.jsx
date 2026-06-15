'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDownToLine, ArrowUpFromLine, Copy, RefreshCw } from 'lucide-react'
import { ProductShell, EmptyState, StatusPill, StatCard } from '@/components/ProductShell'
import { walletService } from '@/services/walletService'

export default function WalletsPage() {
  const [asset, setAsset] = useState('USDT')
  const [depositAmount, setDepositAmount] = useState('1000')
  const [withdrawAmount, setWithdrawAmount] = useState('100')
  const [address, setAddress] = useState('external_wallet_address')
  const balancesQuery = useQuery({ queryKey: ['balances'], queryFn: () => walletService.getBalances(), retry: 1 })
  const depositsQuery = useQuery({ queryKey: ['deposits'], queryFn: () => walletService.getDeposits(), retry: 1 })
  const withdrawalsQuery = useQuery({ queryKey: ['withdrawals'], queryFn: () => walletService.getWithdrawals(), retry: 1 })
  const addressQuery = useQuery({ queryKey: ['deposit-address', asset], queryFn: () => walletService.getDepositAddress(asset), retry: 1 })
  const data = balancesQuery.data
  const balances = data?.balances || []
  const totalAssets = balances.length
  const lockedAssets = balances.filter((item) => Number(item.locked || 0) > 0).length

  async function createDeposit() {
    try {
      const deposit = await walletService.createMockDeposit(asset, depositAmount)
      toast.success('Mock deposit created')
      depositsQuery.refetch()
      return deposit
    } catch (error) {
      toast.error(error.message || 'Could not create deposit')
    }
  }

  async function confirmDeposit(id) {
    try {
      await walletService.confirmDeposit(id)
      toast.success('Deposit confirmation added')
      balancesQuery.refetch()
      depositsQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not confirm deposit')
    }
  }

  async function withdraw() {
    try {
      await walletService.createWithdrawal(asset, address, withdrawAmount)
      toast.success('Withdrawal requested')
      balancesQuery.refetch()
      withdrawalsQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not request withdrawal')
    }
  }

  async function cancelWithdrawal(id) {
    try {
      await walletService.cancelWithdrawal(id)
      toast.success('Withdrawal cancelled')
      balancesQuery.refetch()
      withdrawalsQuery.refetch()
    } catch (error) {
      toast.error(error.message || 'Could not cancel withdrawal')
    }
  }

  function refreshAll() {
    balancesQuery.refetch()
    depositsQuery.refetch()
    withdrawalsQuery.refetch()
    addressQuery.refetch()
  }

  return <ProductShell title="Wallets" subtitle="Available, locked, deposit, and withdrawal balances.">
    <div className="mb-4 grid gap-3 md:grid-cols-3">
      <StatCard label="Assets" value={totalAssets} detail="Wallets with balances" />
      <StatCard label="Locked assets" value={lockedAssets} detail="Reserved in orders or withdrawals" />
      <button onClick={refreshAll} className="panel stat-card flex items-center justify-between p-5 text-left text-sm text-slate-300 hover:border-amber-400/30">
        <span><span className="block text-xs uppercase tracking-[0.16em] text-slate-500">Refresh</span><span className="mt-3 block text-xl font-semibold text-white">Sync wallet</span></span>
        <RefreshCw size={20} className="text-amber-400" />
      </button>
    </div>
    <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
      <div className="panel p-5">
        <div className="panel-title -mx-5 -mt-5 mb-4"><span className="flex items-center gap-2"><ArrowDownToLine size={15} /> Mock Deposit</span><StatusPill tone="success">Instant testnet credit</StatusPill></div>
        <div className="mb-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><Copy size={13} /> Deposit address</div>
          <div className="break-all font-mono text-sm text-slate-200">{addressQuery.data?.address || 'Log in to generate address'}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} className="auth-input mt-0" placeholder="Asset" />
          <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} className="auth-input mt-0" placeholder="Amount" />
          <button onClick={createDeposit} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black">Create deposit</button>
        </div>
      </div>
      <div className="panel p-5">
        <div className="panel-title -mx-5 -mt-5 mb-4"><span className="flex items-center gap-2"><ArrowUpFromLine size={15} /> Withdraw</span><StatusPill tone="warning">Approval flow</StatusPill></div>
        <div className="grid gap-2 sm:grid-cols-[0.55fr_1fr_0.7fr]">
          <input value={asset} onChange={(event) => setAsset(event.target.value.toUpperCase())} className="auth-input mt-0" placeholder="Asset" />
          <input value={address} onChange={(event) => setAddress(event.target.value)} className="auth-input mt-0" placeholder="Address" />
          <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="auth-input mt-0" placeholder="Amount" />
        </div>
        <div className="mt-2">
          <button onClick={withdraw} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white">Request withdrawal</button>
        </div>
      </div>
    </div>
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-4 border-b border-white/5 px-4 py-3 text-xs uppercase tracking-wider text-slate-600"><span>Asset</span><span className="text-right">Available</span><span className="text-right">Locked</span><span className="text-right">Total</span></div>
      {balances.length ? balances.map((item) => <div key={item.asset} className="asset-row grid grid-cols-4 border-b border-white/5 px-4 py-4 text-sm"><span className="font-medium text-white">{item.asset}<span className="ml-2 text-xs text-slate-600">{item.asset_name}</span></span><span className="text-right font-mono">{item.available}</span><span className="text-right font-mono text-amber-400">{item.locked}</span><span className="text-right font-mono">{item.total}</span></div>) : <EmptyState>Log in to view wallet balances.</EmptyState>}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <HistoryPanel title="Deposits" rows={depositsQuery.data?.deposits || []} actionLabel="Confirm" onAction={confirmDeposit} />
      <HistoryPanel title="Withdrawals" rows={withdrawalsQuery.data?.withdrawals || []} actionLabel="Cancel" onAction={cancelWithdrawal} />
    </div>
  </ProductShell>
}

function HistoryPanel({ title, rows, actionLabel, onAction }) {
  return <div className="panel overflow-hidden">
    <div className="panel-title">{title}</div>
    {rows.length ? rows.map((row) => <div key={row.id} className="grid grid-cols-[1fr_0.7fr_0.8fr_auto] items-center gap-2 border-b border-white/5 px-4 py-3 text-xs">
      <span className="truncate text-slate-300">
        {row.asset && <span className="mr-1.5 font-bold text-amber-400">{row.asset}</span>}
        {row.tx_hash || row.address || row.id}
      </span>
      <span className="font-mono">{row.amount}</span>
      <StatusPill tone={row.status === 'COMPLETED' ? 'success' : row.status === 'FAILED' || row.status === 'CANCELLED' ? 'danger' : 'warning'}>{row.status}</StatusPill>
      {actionLabel && row.status !== 'COMPLETED' ? <button onClick={() => onAction(row.id)} className="rounded bg-white/5 px-2 py-1 text-amber-400">{actionLabel}</button> : <span />}
    </div>) : <EmptyState>No {title.toLowerCase()} yet.</EmptyState>}
  </div>
}
