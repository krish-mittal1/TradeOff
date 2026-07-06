'use client'

import { Component } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070a0f] p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/15">
            <BarChart3 size={28} className="text-rose-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            The app hit an unexpected error. Refreshing usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-[#0b0e14] hover:bg-amber-300 transition"
          >
            <RefreshCw size={14} /> Reload page
          </button>
        </div>
      </div>
    )
  }
}
