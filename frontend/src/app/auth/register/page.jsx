'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { BarChart3 } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (password !== confirm) {
      toast.error('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      await register(email, password)
      toast.success('Account created. Welcome to TradeOff!')
      router.push('/')
    } catch (error) {
      toast.error(error.message || 'Registration failed')
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
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-sm text-slate-500">Start trading on TradeOff</p>
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
                placeholder="Min 8 chars, mixed case, number, special char"
                required
              />
            </label>
            <label className="auth-label">
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="auth-input"
                placeholder="Repeat password"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300 disabled:opacity-60"
            >
              {busy ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-amber-400 hover:text-amber-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
