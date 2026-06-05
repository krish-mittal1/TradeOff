'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BarChart3, Bell, Bot, Copy, LayoutDashboard, LogOut, Menu, Shield, User, Wallet, X } from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/providers/AuthProvider'

const links = [
  ['Trade', '/', BarChart3],
  ['Portfolio', '/portfolio', LayoutDashboard],
  ['Wallets', '/wallets', Wallet],
  ['Copy Trading', '/copy-trading', Copy],
  ['AI Assistant', '/assistant', Bot],
  ['Notifications', '/notifications', Bell],
  ['Profile', '/profile', User],
  ['Admin', '/admin', Shield],
]

export function ProductShell({ title, subtitle, children }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="product-app min-h-screen bg-[#070a0f] text-slate-300">
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#171c26', color: '#e2e8f0', border: '1px solid rgba(255,255,255,.08)' } }} />
      <header className="product-header border-b border-white/5 bg-[#090c12]">
        <div className="flex h-16 items-center px-5">
          <Link href="/" className="flex items-center gap-2.5 text-white">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-[#0b0e14]"><BarChart3 size={20} /></span>
            <span className="text-xl font-bold">TradeOff</span>
          </Link>
          <nav className="ml-10 hidden items-center gap-1 md:flex">
            {links.map(([label, href, Icon]) => (
              <Link key={href} href={href} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-white">
                <Icon size={14} /> {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/notifications" className="icon-button"><Bell size={17} /></Link>
            {user && <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-slate-400 hover:text-white"><LogOut size={14} /> Log out</button>}
            <button onClick={() => setMenuOpen((value) => !value)} className="icon-button md:hidden" aria-label="Open menu">{menuOpen ? <X size={17} /> : <Menu size={17} />}</button>
          </div>
        </div>
        {menuOpen && (
          <nav className="product-mobile-menu md:hidden">
            {links.map(([label, href, Icon]) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
                <Icon size={15} /> {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="product-main mx-auto max-w-7xl px-4 py-8">
        <div className="hero-card mb-8">
          <div>
            <div className="eyebrow">Exchange Control Center</div>
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          <div className="hidden rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-right md:block">
            <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300/80">Mode</div>
            <div className="mt-1 text-sm font-semibold text-amber-200">Simulator</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

export function StatCard({ label, value, detail }) {
  return <div className="panel stat-card p-5"><div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div><div className="mt-3 text-2xl font-semibold text-white">{value}</div>{detail && <div className="mt-2 text-xs text-slate-600">{detail}</div>}</div>
}

export function EmptyState({ children }) {
  return <div className="panel grid min-h-48 place-items-center p-8 text-sm text-slate-500">{children}</div>
}

export function StatusPill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.035] text-slate-300',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    danger: 'border-rose-400/20 bg-rose-400/10 text-rose-300',
  }
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${tones[tone] || tones.neutral}`}>{children}</span>
}
