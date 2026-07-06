'use client'

import { useState } from 'react'
import { Link2, Unlink, Wallet, ExternalLink, ChevronDown } from 'lucide-react'
import { useWeb3 } from '@/providers/Web3Provider'
import { blockchainService } from '@/services/blockchainService'
import toast from 'react-hot-toast'

export function WalletConnectButton() {
  const { account, shortAddress, connecting, isMetaMask, connect, disconnect } = useWeb3()
  const [menuOpen, setMenuOpen] = useState(false)

  if (!isMetaMask) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-300 transition hover:bg-amber-400/20"
      >
        <Wallet size={14} /> Install MetaMask
      </a>
    )
  }

  if (!account) {
    return (
      <button
        onClick={async () => {
          const addr = await connect()
          if (addr) {
            try { await blockchainService.linkWallet(addr) } catch {}
            toast.success('Wallet connected!')
          }
        }}
        disabled={connecting}
        className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-gradient-to-r from-amber-500/20 to-amber-600/20 px-3 py-2 text-xs text-amber-300 transition hover:from-amber-500/30 hover:to-amber-600/30 disabled:opacity-50"
      >
        <Wallet size={14} />
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300"
      >
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        {shortAddress}
        <ChevronDown size={12} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-white/10 bg-[var(--t-panel)] p-1 shadow-xl">
          <a
            href={`https://sepolia.etherscan.io/address/${account}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
            onClick={() => setMenuOpen(false)}
          >
            <ExternalLink size={13} /> View on Etherscan
          </a>
          <button
            onClick={() => { disconnect(); setMenuOpen(false); toast('Wallet disconnected') }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-rose-400 hover:bg-white/5"
          >
            <Unlink size={13} /> Disconnect
          </button>
        </div>
      )}
    </div>
  )
}
