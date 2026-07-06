import { BarChart3 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070a0f]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-400/10 border-t-amber-400" />
          <div className="absolute inset-0 flex items-center justify-center">
            <BarChart3 size={16} className="text-amber-400/50" />
          </div>
        </div>
        <span className="text-xs font-medium tracking-wider text-slate-600">LOADING</span>
      </div>
    </div>
  )
}
