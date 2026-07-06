'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Coins, ExternalLink, Hash, Link2, Loader2, Shield, Wallet } from 'lucide-react'
import { ProductShell, StatCard } from '@/components/ProductShell'
import { useWeb3 } from '@/providers/Web3Provider'
import { useAuth } from '@/providers/AuthProvider'
import { blockchainService } from '@/services/blockchainService'
import { tradingService } from '@/services/tradingService'
import toast from 'react-hot-toast'

export default function BlockchainPage() {
  const { account, shortAddress, isMetaMask, connect, isSepoliaNetwork } = useWeb3()
  const { user } = useAuth()
  const [status, setStatus] = useState(null)
  const [trades, setTrades] = useState([])
  const [settling, setSettling] = useState(null)
  const [settlements, setSettlements] = useState({})
  const [tokenBalance, setTokenBalance] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [settlementCount, setSettlementCount] = useState(null)

  useEffect(() => {
    blockchainService.getStatus().then(setStatus).catch(() => {})
    blockchainService.getSettlementCount().then((r) => setSettlementCount(r.total_settlements)).catch(() => {})
  }, [])

  useEffect(() => {
    if (user) {
      tradingService.getTrades({ limit: 20 }).then((res) => {
        setTrades(res.trades || [])
      }).catch(() => {})
    }
  }, [user])

  useEffect(() => {
    if (account) {
      blockchainService.getTokenBalance(account).then(setTokenBalance).catch(() => {})
    }
  }, [account])

  const handleSettle = useCallback(async (tradeId) => {
    setSettling(tradeId)
    try {
      const result = await blockchainService.settleTrade(tradeId)
      setSettlements((prev) => ({ ...prev, [tradeId]: result.settlement }))
      setSettlementCount((c) => (c ?? 0) + 1)
      toast.success('Trade settled on-chain!')
    } catch (err) {
      toast.error(err?.message || 'Settlement failed')
    } finally {
      setSettling(null)
    }
  }, [])

  const handleVerify = useCallback(async (tradeId) => {
    try {
      const result = await blockchainService.verifyTrade(tradeId)
      if (result.verified) {
        toast.success('Trade verified on blockchain!')
        setSettlements((prev) => ({ ...prev, [tradeId]: { status: 'confirmed', explorer_url: result.explorer_url } }))
      } else {
        toast.error('Trade not found on blockchain')
      }
    } catch {
      toast.error('Verification failed')
    }
  }, [])

  const handleFaucet = useCallback(async () => {
    setClaiming(true)
    try {
      const result = await blockchainService.claimFaucet()
      toast.success(`Claimed ${result.tokens_claimed} TFO tokens!`)
      if (account) {
        blockchainService.getTokenBalance(account).then(setTokenBalance).catch(() => {})
      }
    } catch (err) {
      toast.error(err?.message || 'Faucet claim failed')
    } finally {
      setClaiming(false)
    }
  }, [account])

  return (
    <ProductShell title="Blockchain" subtitle="On-chain trade settlement & verification">
      {/* Status Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard label="Network" value={status?.network?.toUpperCase() || 'Sepolia'} detail="Ethereum Testnet" />
        <StatCard label="Wallet" value={shortAddress || 'Not Connected'} detail={account ? 'MetaMask' : 'Connect to start'} />
        <StatCard label="On-chain Settlements" value={settlementCount ?? '—'} detail={status?.enabled ? 'Total recorded' : 'Offline'} />
        <StatCard label="TFO Balance" value={tokenBalance ? Number(tokenBalance.balance).toLocaleString() : '—'} detail="TradeOff ERC-20 Token" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Wallet Connection */}
        <div className="panel p-6">
          <h2 className="mb-4 text-sm font-semibold text-white flex items-center gap-2"><Wallet size={16} className="text-amber-400" /> Wallet Connection</h2>

          {!isMetaMask ? (
            <div className="text-center py-8">
              <Wallet size={40} className="mx-auto mb-3 text-slate-600" />
              <p className="text-sm text-slate-400 mb-4">MetaMask is required for blockchain features</p>
              <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
                Install MetaMask <ExternalLink size={14} />
              </a>
            </div>
          ) : !account ? (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/10 text-amber-400">
                <Wallet size={28} />
              </div>
              <p className="text-sm text-slate-400 mb-4">Connect your MetaMask wallet to enable on-chain settlement</p>
              <button onClick={async () => {
                const addr = await connect()
                if (addr) {
                  try { await blockchainService.linkWallet(addr) } catch {}
                  toast.success('Wallet connected & linked!')
                }
              }} className="btn-primary px-6 py-2.5 text-sm">Connect Wallet</button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Connected
                </div>
                <p className="font-mono text-sm text-white break-all">{account}</p>
              </div>
              {!isSepoliaNetwork && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-300">
                  Switch to Sepolia testnet in MetaMask for settlement features
                </div>
              )}

              {/* TFO Token Balance + Faucet */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-white">
                    <Coins size={14} className="text-amber-400" /> TFO Token
                  </div>
                  {tokenBalance?.token_address && (
                    <a
                      href={`https://sepolia.etherscan.io/token/${tokenBalance.token_address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-500 hover:text-white"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <div className="text-xl font-bold text-white mb-1">
                  {tokenBalance ? Number(tokenBalance.balance).toLocaleString() : '—'}
                  <span className="ml-1.5 text-xs font-normal text-slate-500">TFO</span>
                </div>
                <button
                  onClick={handleFaucet}
                  disabled={claiming || !user}
                  className="mt-3 w-full rounded-lg border border-amber-400/20 bg-amber-400/10 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-40"
                >
                  {claiming ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Claim 1,000 TFO (Faucet)'}
                </button>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">How it works</div>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Make trades on TradeOff as usual</li>
                  <li>Click &quot;Settle&quot; to record the trade on Ethereum</li>
                  <li>Get a permanent, verifiable receipt on-chain</li>
                  <li>Verify any trade anytime via Etherscan</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Right: Trade Settlement */}
        <div className="panel p-6 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-white flex items-center gap-2"><Shield size={16} className="text-amber-400" /> Trade Settlement</h2>

          {!user ? (
            <p className="text-sm text-slate-500 py-8 text-center">Log in to see your trades</p>
          ) : trades.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">No trades yet. Start trading to settle on-chain!</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {trades.map((trade) => {
                const receipt = settlements[trade.id]
                const isSettling = settling === trade.id
                return (
                  <div key={trade.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/10">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${trade.side === 'BUY' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'}`}>
                      {trade.side === 'BUY' ? '↑' : '↓'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{trade.pair}</span>
                        <span className={`text-[10px] font-semibold ${trade.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>{trade.side}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {Number(trade.quantity).toFixed(6)} @ ${Number(trade.price).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {receipt ? (
                        <>
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                            <CheckCircle2 size={12} /> On-chain
                          </span>
                          {receipt.explorer_url && (
                            <a href={receipt.explorer_url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300">
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSettle(trade.id)}
                            disabled={isSettling || !account}
                            className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-40"
                          >
                            {isSettling ? <Loader2 size={12} className="animate-spin" /> : 'Settle'}
                          </button>
                          <button
                            onClick={() => handleVerify(trade.id)}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-400 transition hover:text-white hover:border-white/20"
                          >
                            Verify
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <Hash size={20} className="mb-3 text-amber-400" />
          <h3 className="text-sm font-semibold text-white mb-1">Immutable Records</h3>
          <p className="text-xs text-slate-500">Every settled trade is permanently recorded on Ethereum. No one can alter or delete it.</p>
        </div>
        <div className="panel p-5">
          <Shield size={20} className="mb-3 text-amber-400" />
          <h3 className="text-sm font-semibold text-white mb-1">Verifiable Proof</h3>
          <p className="text-xs text-slate-500">Anyone can verify your trade history on Etherscan using the settlement contract.</p>
        </div>
        <div className="panel p-5">
          <Link2 size={20} className="mb-3 text-amber-400" />
          <h3 className="text-sm font-semibold text-white mb-1">Testnet Powered</h3>
          <p className="text-xs text-slate-500">All blockchain activity uses test ETH — zero cost, zero risk, real blockchain experience.</p>
        </div>
      </div>
    </ProductShell>
  )
}
