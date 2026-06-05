'use client'

import Link from 'next/link'
import { BarChart3, MailCheck } from 'lucide-react'

export default function VerifyPage() {
  return (
    <div className="min-h-screen bg-[#070a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-[#0b0e14]">
            <BarChart3 size={24} strokeWidth={2.8} />
          </div>
          <MailCheck size={48} className="text-emerald-400 mt-2" />
          <h1 className="text-2xl font-bold text-white">Check your email</h1>
          <p className="text-sm text-slate-500 max-w-sm">
            In this simulator, email verification is skipped. Your account is ready to use.
          </p>
        </div>
        <Link
          href="/"
          className="inline-block rounded-lg bg-amber-400 px-6 py-2.5 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300"
        >
          Go to exchange
        </Link>
      </div>
    </div>
  )
}
