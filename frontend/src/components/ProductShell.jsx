'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, Bell, Bot, Blocks, ChevronDown, Copy,
  LayoutDashboard, LogOut, Menu, Shield, User, Wallet, X,
} from 'lucide-react'
import { Toaster } from 'react-hot-toast'
import { useAuth } from '@/providers/AuthProvider'

// Core nav — shown on every screen
const CORE_LINKS = [
  { label: 'Trade', href: '/',           icon: BarChart3,     tip: 'Buy & sell crypto (practice mode)' },
  { label: 'Markets', href: '/market',   icon: BarChart3,     tip: 'Live prices for all trading pairs' },
  { label: 'Portfolio', href: '/portfolio', icon: LayoutDashboard, tip: 'Your holdings & performance' },
  { label: 'Wallets', href: '/wallets',  icon: Wallet,        tip: 'Deposit, withdraw, and view balances' },
  { label: 'AI Help', href: '/assistant',icon: Bot,           tip: 'Ask our AI about trading strategies' },
]

// Extra links in the "More" dropdown
const MORE_LINKS = [
  { label: 'Copy Trading', href: '/copy-trading', icon: Copy },
  { label: 'Blockchain', href: '/blockchain',     icon: Blocks },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Profile', href: '/profile',           icon: User },
]

export function ProductShell({ title, subtitle, children }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)

  const allLinks = [
    ...CORE_LINKS,
    ...MORE_LINKS,
    ...(user?.is_admin ? [{ label: 'Admin', href: '/admin', icon: Shield }] : []),
  ]

  function isActive(href) {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  return (
    <div className="product-app min-h-screen" style={{ background: 'var(--t-body)', color: 'var(--t-text2)' }}>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { background: 'var(--t-panel)', color: 'var(--t-text)', border: '1px solid var(--t-border)', borderRadius: '12px', fontSize: '13px', boxShadow: '0 12px 40px var(--t-shadow)' },
          success: { iconTheme: { primary: '#10b981', secondary: 'var(--t-panel)' } },
          error: { iconTheme: { primary: '#ef4444', secondary: 'var(--t-panel)' } },
        }}
      />

      <header style={{ background: 'var(--t-header)', borderBottom: '1px solid var(--t-border)' }}>
        <div className="flex h-14 items-center px-4 gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0" style={{ color: 'var(--t-text)' }}>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-[#0b0e14] shadow-md shadow-amber-500/20">
              <BarChart3 size={17} />
            </span>
            <span className="text-lg font-bold hidden sm:block">Trade<span className="text-amber-400">Off</span></span>
          </Link>

          {/* Practice badge */}
          <span className="hidden sm:inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400 tracking-wide">
            PAPER TRADING
          </span>

          {/* Desktop nav */}
          <nav className="ml-4 hidden items-center gap-0.5 lg:flex">
            {CORE_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                title={CORE_LINKS.find((l) => l.href === href)?.tip}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                  isActive(href)
                    ? 'bg-amber-400/10 text-amber-400'
                    : 'hover:bg-black/5 dark:hover:bg-white/[0.06]'
                }`}
                style={{ color: isActive(href) ? undefined : 'var(--t-text2)' }}
              >
                {label}
              </Link>
            ))}

            {/* More dropdown */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition hover:bg-black/5 dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--t-text2)' }}
              >
                More <ChevronDown size={13} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen && (
                <div
                  className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border py-1 shadow-xl"
                  style={{ background: 'var(--t-panel)', borderColor: 'var(--t-border)' }}
                  onMouseLeave={() => setMoreOpen(false)}
                >
                  {[...MORE_LINKS, ...(user?.is_admin ? [{ label: 'Admin', href: '/admin', icon: Shield }] : [])].map(({ label, href, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition hover:bg-black/5 dark:hover:bg-white/5"
                      style={{ color: 'var(--t-text2)' }}
                    >
                      <Icon size={14} className="text-slate-400" /> {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:block text-xs" style={{ color: 'var(--t-text3)' }}>
                  {user.email?.split('@')[0] || 'Trader'}
                </span>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition hover:opacity-80"
                  style={{ borderColor: 'var(--t-border)', color: 'var(--t-text2)' }}
                >
                  <LogOut size={13} /> Log out
                </button>
              </>
            ) : (
              <Link
                href="/"
                className="rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-3.5 py-1.5 text-xs font-semibold text-[#0b0e14] shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 active:scale-95"
              >
                Sign In / Register
              </Link>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="icon-button lg:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav
            className="lg:hidden border-t py-2 px-3 flex flex-col gap-0.5"
            style={{ borderColor: 'var(--t-border)', background: 'var(--t-header)' }}
          >
            {allLinks.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                  isActive(href) ? 'bg-amber-400/10 text-amber-400' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                style={{ color: isActive(href) ? undefined : 'var(--t-text2)' }}
              >
                <Icon size={15} className={isActive(href) ? 'text-amber-400' : 'text-slate-400'} />
                {label}
              </Link>
            ))}
            {!user && (
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-[#0b0e14]"
              >
                Sign In / Create Account
              </Link>
            )}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--t-text)' }}>{title}</h1>
            {subtitle && <p className="mt-1 text-sm" style={{ color: 'var(--t-text3)' }}>{subtitle}</p>}
          </div>
          <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-xs font-medium text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Practice mode — no real money
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}

export function StatCard({ label, value, detail }) {
  return (
    <div className="panel p-5 transition-colors hover:border-white/[0.1]" style={{ cursor: 'default' }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--t-text3)' }}>{label}</div>
      <div className="mt-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--t-text)' }}>{value}</div>
      {detail && <div className="mt-1.5 text-xs" style={{ color: 'var(--t-text3)' }}>{detail}</div>}
    </div>
  )
}

export function EmptyState({ children, icon: Icon, action }) {
  return (
    <div className="panel grid min-h-48 place-items-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        {Icon && (
          <div className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: 'var(--t-hover)' }}>
            <Icon size={22} style={{ color: 'var(--t-text3)' }} />
          </div>
        )}
        <div className="text-sm" style={{ color: 'var(--t-text3)' }}>{children}</div>
        {action}
      </div>
    </div>
  )
}

export function StatusPill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-white/10 bg-white/[0.035] text-slate-300',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    danger:  'border-rose-400/20 bg-rose-400/10 text-rose-300',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  )
}

export function LoginGate({ message, icon: Icon }) {
  return (
    <div className="panel p-10 flex flex-col items-center gap-5 text-center">
      {Icon && (
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/10 ring-1 ring-amber-400/20">
          <Icon size={28} className="text-amber-400" />
        </div>
      )}
      <div>
        <p className="text-base font-medium" style={{ color: 'var(--t-text)' }}>Sign in to continue</p>
        <p className="mt-1 text-sm max-w-sm" style={{ color: 'var(--t-text3)' }}>
          {message || 'Create a free account to access this feature. No real money needed — this is a practice exchange.'}
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-[#0b0e14] shadow-md shadow-amber-500/20 transition hover:from-amber-300 hover:to-amber-400 active:scale-95"
      >
        Sign In / Create Account →
      </Link>
      <p className="text-xs" style={{ color: 'var(--t-text3)' }}>
        Free • No credit card • Paper trading only
      </p>
    </div>
  )
}
