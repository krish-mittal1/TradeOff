'use client'

import { useState } from 'react'
import { ProductShell } from '@/components/ProductShell'
import { apiClient } from '@/services/api'

export default function AssistantPage() {
  const [message, setMessage] = useState('Analyze my portfolio risk')
  const [response, setResponse] = useState('Ask about portfolio allocation, market context, order execution, or risk.')
  async function ask(event) {
    event.preventDefault()
    try { setResponse((await apiClient.post('/ai/chat', { message })).response) } catch (error) { setResponse(error.message) }
  }
  return <ProductShell title="AI Trading Assistant" subtitle="Read-only explanations and market context. Not financial advice.">
    <div className="panel mx-auto max-w-3xl p-5">
      <div className="min-h-64 whitespace-pre-wrap rounded-lg bg-white/[0.025] p-4 text-sm leading-7 text-slate-300">{response}</div>
      <form onSubmit={ask} className="mt-4 flex gap-2"><input value={message} onChange={(event) => setMessage(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/5 bg-white/[0.035] px-3 py-2 text-sm text-white focus:border-amber-400/30 focus:ring-0" /><button className="rounded-lg bg-amber-400 px-5 text-sm font-semibold text-black">Ask</button></form>
    </div>
  </ProductShell>
}
