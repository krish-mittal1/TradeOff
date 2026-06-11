'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ProductShell, StatusPill } from '@/components/ProductShell'
import { apiClient } from '@/services/api'
import { Bot, Send, BrainCircuit, TrendingUp, RefreshCw } from 'lucide-react'

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT']

// Fallback AI responses when backend is unavailable
const FALLBACK_ANALYSIS = {
  risk_score: 'MEDIUM',
  market_outlook: 'NEUTRAL',
  summary: 'Your portfolio is diversified across major crypto assets. BTC dominance suggests a risk-on environment. Consider rebalancing if any single asset exceeds 50% of total value.',
  recommendations: [
    'Maintain at least 20% in stablecoins (USDT) as dry powder.',
    'Set stop-loss orders on leveraged positions.',
    'Avoid over-concentrating in high-volatility altcoins.',
    'Dollar-cost averaging into BTC on dips below $65k.',
  ],
}

const FALLBACK_MARKET_SUMMARY = {
  BTCUSDT: { sentiment: 'BULLISH', summary: 'BTC is showing strong momentum above $68k with increasing volume. Key resistance at $72k. RSI indicates overbought conditions in the short term.', technical_indicators: { rsi: '67.4', macd: '+412.8', support: '$65,200', resistance: '$72,000' } },
  ETHUSDT: { sentiment: 'BULLISH', summary: 'ETH consolidating after recent gains. EIP upgrade anticipation driving sentiment. Watch for breakout above $3,800.', technical_indicators: { rsi: '58.2', macd: '+124.6', support: '$3,400', resistance: '$3,800' } },
  SOLUSDT: { sentiment: 'NEUTRAL', summary: 'SOL trending sideways in a tight range. Fundamentals remain strong but facing short-term selling pressure from unlock events.', technical_indicators: { rsi: '48.9', macd: '-8.3', support: '$165', resistance: '$185' } },
  BNBUSDT: { sentiment: 'BULLISH', summary: 'BNB benefiting from exchange revenue growth. Exchange token fundamentals remain solid. Support established at $600.', technical_indicators: { rsi: '61.7', macd: '+45.2', support: '$600', resistance: '$650' } },
}

const CHAT_FALLBACKS = {
  'risk': 'Based on your portfolio, your overall risk score is MEDIUM. You hold a diversified basket of assets, but crypto volatility means you should always maintain stop-losses and never invest more than you can afford to lose.',
  'bitcoin': 'Bitcoin (BTC) is currently showing bullish momentum above $68k. The 200-day moving average is at ~$52k, providing strong long-term support. RSI at 67 suggests moderate overbought conditions.',
  'limit': 'A Limit Order lets you set the exact price at which you want to buy or sell. It only executes when the market reaches your price — great for precision entries. A Market Order executes immediately at the best available price — faster but you accept slippage.',
  'risk manage': 'Key risk management principles: (1) Never risk more than 1-2% per trade. (2) Use stop-loss orders on every position. (3) Diversify across uncorrelated assets. (4) Keep 20-30% in stablecoins as dry powder.',
  default: "I'm your TradeOff AI assistant. I can help with portfolio risk analysis, technical indicator interpretation, order types, and trading strategy. The AI backend is currently offline, but I can answer common questions with my built-in knowledge.",
}

function getChatFallback(message) {
  const lower = message.toLowerCase()
  for (const [key, response] of Object.entries(CHAT_FALLBACKS)) {
    if (key !== 'default' && lower.includes(key)) return response
  }
  return CHAT_FALLBACKS.default
}

export default function AssistantPage() {
  const [messages, setMessages] = useState([
    { sender: 'assistant', text: "Hello! I'm your AI Trading Assistant. I can analyze your portfolio risk, summarize market sentiment, and explain trading concepts. Ask me anything!" }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [selectedPair, setSelectedPair] = useState('BTCUSDT')
  const [portfolioAnalysis, setPortfolioAnalysis] = useState(null)
  const [portfolioLoading, setPortfolioLoading] = useState(true)
  const [marketSummary, setMarketSummary] = useState(null)
  const [marketLoading, setMarketLoading] = useState(true)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchPortfolioAnalysis = useCallback(async () => {
    setPortfolioLoading(true)
    try {
      const data = await apiClient.post('/ai/portfolio-analysis')
      setPortfolioAnalysis(data)
    } catch {
      setPortfolioAnalysis(FALLBACK_ANALYSIS)
    } finally {
      setPortfolioLoading(false)
    }
  }, [])

  const fetchMarketSummary = useCallback(async (pair) => {
    setMarketLoading(true)
    try {
      const data = await apiClient.post(`/ai/market-summary?pair=${pair}`)
      setMarketSummary(data)
    } catch {
      setMarketSummary(FALLBACK_MARKET_SUMMARY[pair] || FALLBACK_MARKET_SUMMARY.BTCUSDT)
    } finally {
      setMarketLoading(false)
    }
  }, [])

  useEffect(() => { fetchPortfolioAnalysis() }, [fetchPortfolioAnalysis])
  useEffect(() => { fetchMarketSummary(selectedPair) }, [selectedPair, fetchMarketSummary])

  async function handleChatSubmit(e) {
    e.preventDefault()
    if (!chatInput.trim() || chatBusy) return
    const userText = chatInput.trim()
    setMessages((prev) => [...prev, { sender: 'user', text: userText }])
    setChatInput('')
    setChatBusy(true)
    try {
      const data = await apiClient.post('/ai/chat', { message: userText })
      setMessages((prev) => [...prev, { sender: 'assistant', text: data.response }])
    } catch {
      // Fallback response
      await new Promise((r) => setTimeout(r, 600)) // simulate thinking
      setMessages((prev) => [...prev, { sender: 'assistant', text: getChatFallback(userText) }])
    } finally {
      setChatBusy(false)
    }
  }

  return (
    <ProductShell title="AI Trading Assistant" subtitle="Portfolio risk analysis, market sentiment, and conversational insight.">
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">

        {/* Left Column */}
        <div className="space-y-4">

          {/* Portfolio Analysis */}
          <div className="panel p-5 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/5 pointer-events-none" />
            <div className="panel-title -mx-5 -mt-5 mb-4">
              <span className="flex items-center gap-2">
                <BrainCircuit size={15} className="text-amber-400" />
                AI Portfolio Risk
              </span>
              <div className="flex items-center gap-2">
                <StatusPill tone="success">Active</StatusPill>
                <button onClick={fetchPortfolioAnalysis} className="text-slate-600 hover:text-slate-300 transition">
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>

            {portfolioLoading ? (
              <div className="space-y-2 py-4">
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-white/5" />
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center rounded-lg bg-white/[0.025] p-3 border border-white/5">
                  <span className="text-slate-500 font-medium">Risk Score</span>
                  <StatusPill tone={portfolioAnalysis?.risk_score === 'HIGH' ? 'danger' : portfolioAnalysis?.risk_score === 'LOW' ? 'success' : 'warning'}>
                    {portfolioAnalysis?.risk_score || 'MEDIUM'}
                  </StatusPill>
                </div>
                <div className="flex justify-between items-center rounded-lg bg-white/[0.025] p-3 border border-white/5">
                  <span className="text-slate-500 font-medium">Market Outlook</span>
                  <StatusPill tone="neutral">{portfolioAnalysis?.market_outlook || 'NEUTRAL'}</StatusPill>
                </div>
                <p className="text-slate-400 leading-relaxed font-light">{portfolioAnalysis?.summary}</p>
                <div className="border-t border-white/5 pt-2">
                  <div className="mb-2 font-semibold text-slate-400">Recommendations:</div>
                  <ul className="space-y-1.5 text-slate-500 list-disc pl-4">
                    {(portfolioAnalysis?.recommendations || []).map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Market Summary */}
          <div className="panel p-5">
            <div className="panel-title -mx-5 -mt-5 mb-4">
              <span className="flex items-center gap-2">
                <TrendingUp size={15} className="text-emerald-400" />
                AI Market Summary
              </span>
              <select
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                className="rounded border border-white/10 bg-[#10141d] px-2 py-0.5 text-[11px] text-white focus:outline-none"
              >
                {PAIRS.map((p) => (
                  <option key={p} value={p}>{p.replace('USDT', '/USDT')}</option>
                ))}
              </select>
            </div>

            {marketLoading ? (
              <div className="space-y-2 py-4">
                <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center rounded-lg bg-white/[0.025] p-2.5 border border-white/5">
                  <span className="text-slate-500">Sentiment</span>
                  <StatusPill tone={marketSummary?.sentiment === 'BULLISH' ? 'success' : marketSummary?.sentiment === 'BEARISH' ? 'danger' : 'neutral'}>
                    {marketSummary?.sentiment || 'NEUTRAL'}
                  </StatusPill>
                </div>
                <p className="text-slate-400 font-light leading-relaxed">{marketSummary?.summary}</p>
                <div className="border-t border-white/5 pt-2 space-y-1.5">
                  <div className="font-semibold text-slate-400 mb-2">Technical Indicators</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['RSI', marketSummary?.technical_indicators?.rsi, 'text-amber-400'],
                      ['MACD', marketSummary?.technical_indicators?.macd, 'text-emerald-400'],
                      ['Support', marketSummary?.technical_indicators?.support, 'text-emerald-400'],
                      ['Resistance', marketSummary?.technical_indicators?.resistance, 'text-rose-400'],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-lg bg-white/[0.02] border border-white/5 p-2">
                        <div className="text-slate-600 text-[10px] mb-0.5">{label}</div>
                        <div className={`font-mono text-sm font-semibold ${color}`}>{value || '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chat */}
        <div className="panel flex flex-col overflow-hidden" style={{ height: 640 }}>
          <div className="panel-title border-b border-white/5 px-4 py-3 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bot size={17} className="text-amber-400" />
              Chat Assistant
            </span>
            <span className="font-mono text-[10px] text-slate-500">AI-Powered</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`} style={{ maxWidth: '88%', marginLeft: msg.sender === 'user' ? 'auto' : 0 }}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm ${msg.sender === 'user' ? 'bg-amber-400 text-[#0b0e14]' : 'bg-white/[0.06] text-amber-400'}`}>
                  {msg.sender === 'user' ? 'U' : <Bot size={15} />}
                </div>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.sender === 'user' ? 'rounded-tr-sm bg-amber-400/10 text-amber-100 border border-amber-400/20' : 'rounded-tl-sm bg-white/[0.03] text-slate-300 border border-white/5'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {chatBusy && (
              <div className="flex gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-amber-400 animate-pulse">
                  <Bot size={15} />
                </div>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-slate-500">
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '0ms' }} />
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '150ms' }} />
                  <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick tags */}
          <div className="border-t border-white/5 px-4 py-2 flex gap-2 overflow-x-auto">
            {['Analyze my portfolio risk', 'Is Bitcoin bullish?', 'Limit vs Market order', 'How to manage risk?'].map((tag) => (
              <button
                key={tag}
                onClick={() => setChatInput(tag)}
                className="whitespace-nowrap rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1 text-[11px] text-slate-400 transition hover:border-amber-400/30 hover:text-white"
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleChatSubmit} className="flex gap-2 border-t border-white/5 p-4">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about allocation, risk, technical indicators…"
              className="min-w-0 flex-1 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-amber-400/30 focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatBusy || !chatInput.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-5 text-sm font-bold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          </form>
        </div>

      </div>
    </ProductShell>
  )
}
