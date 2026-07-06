import Link from 'next/link'
import { BarChart3, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a0f] p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/15 to-amber-400/5 ring-1 ring-amber-400/10">
          <BarChart3 size={28} className="text-amber-400" />
        </div>
        <h1 className="font-mono text-6xl font-bold tracking-tighter text-white">404</h1>
        <p className="mt-3 text-sm text-slate-500">
          This page doesn&apos;t exist. Maybe it was moved or you typed the wrong URL.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-[#0b0e14] shadow-lg shadow-amber-500/20 transition-all duration-200 hover:from-amber-300 hover:to-amber-400 hover:shadow-amber-500/30 active:scale-95"
        >
          <ArrowLeft size={14} /> Back to trading
        </Link>
      </div>
    </div>
  )
}
