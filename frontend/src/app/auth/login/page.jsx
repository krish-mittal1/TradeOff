'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { BarChart3 } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [requireTotp, setRequireTotp] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await login(email, password, requireTotp ? totp : null)
      toast.success('Welcome back')
      router.push('/')
    } catch (error) {
      if (error.message?.toLowerCase().includes('mfa') || error.message?.toLowerCase().includes('totp')) {
        setRequireTotp(true)
        toast.error('Enter your 2FA code')
      } else {
        toast.error(error.message || 'Login failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#070a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-[#0b0e14]">
            <BarChart3 size={24} strokeWidth={2.8} />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-sm text-slate-500">Sign in to your TradeOff account</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#10141d] p-6 shadow-2xl">
          <form onSubmit={submit} className="space-y-4">
            <label className="auth-label">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="auth-label">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                placeholder="••••••••"
                required
              />
            </label>
            {requireTotp && (
              <label className="auth-label">
                2FA Code
                <input
                  type="text"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  className="auth-input"
                  placeholder="6-digit code"
                  maxLength={6}
                  autoFocus
                />
              </label>
            )}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300 disabled:opacity-60"
            >
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            New to TradeOff?{' '}
            <Link href="/auth/register" className="text-amber-400 hover:text-amber-300">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
