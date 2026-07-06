'use client'

import { useEffect, useRef, useMemo } from 'react'
import { MARKET_SEED } from '@/lib/marketData'

// ── Constants ──────────────────────────────────────────────────────────────────
const INTERVAL_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }
const INTERVAL_COUNT   = { '1m': 150, '5m': 120, '15m': 100, '1h': 90,  '4h': 72,   '1d': 60  }

// ── Seeded PRNG (Mulberry32) ───────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromString(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return h >>> 0
}

function boxMuller(rand) {
  const u = Math.max(rand(), 1e-10)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

// ── Realistic candle generator ─────────────────────────────────────────────────
// GBM walk backwards from basePrice → last candle always closes at basePrice,
// so the live price tick never causes a spike on first update.
function generateSeedCandles(basePrice, interval, symbol) {
  const count = INTERVAL_COUNT[interval] ?? 100
  const step  = INTERVAL_SECONDS[interval] ?? 60
  const rand  = mulberry32(seedFromString(`${symbol}:${interval}`))

  // Per-candle σ from ~90% annualised crypto vol
  const sigma = 0.9 / Math.sqrt((365.25 * 24 * 3600) / step)

  // Log-returns for each bar
  const returns = Array.from({ length: count }, () => boxMuller(rand) * sigma - sigma * sigma / 2)

  // Build closes walking BACKWARDS from basePrice
  const closes = new Float64Array(count + 1)
  closes[count] = basePrice
  for (let i = count - 1; i >= 0; i--) {
    closes[i] = Math.max(basePrice * 0.15, Math.min(basePrice * 6, closes[i + 1] * Math.exp(-returns[i])))
  }

  const now = Math.floor(Date.now() / step) * step
  return Array.from({ length: count }, (_, i) => {
    const time  = now - (count - i) * step
    const open  = closes[i]
    const close = closes[i + 1]
    const body  = Math.abs(close - open)
    const mid   = (open + close) / 2

    // Random wicks; 6% chance of a spike wick
    const spike = () => rand() < 0.06 ? mid * sigma * (2 + rand() * 4) : 0
    const high = Math.max(open, close) + body * (0.15 + rand() * 0.5) + spike()
    const low  = Math.max(0.000001, Math.min(open, close) - body * (0.15 + rand() * 0.5) - spike())

    // Volume heavier on large moves
    const volume = (0.4 + rand() * 1.6) * (1 + Math.min(body / (mid * sigma + 1e-9), 6) * 0.3) * basePrice * 0.001

    return { time, open, high, low, close, volume }
  })
}

// ── Component ──────────────────────────────────────────────────────────────────
export function CandlestickChart({ market, candles: apiCandles, interval = '1m', chartType = 'candle', livePrice }) {
  const containerRef    = useRef(null)
  const chartRef        = useRef(null)
  const candleSeriesRef = useRef(null)
  const areaSeriesRef   = useRef(null)
  const volumeSeriesRef = useRef(null)
  const lastCandleRef   = useRef(null)

  const basePrice = useMemo(
    () => MARKET_SEED.find((m) => m.symbol === market.symbol)?.price || market.price || 1000,
    [market.symbol, market.price],
  )

  // ── Candle data ────────────────────────────────────────────────────────────
  const candleData = useMemo(() => {
    if (apiCandles && apiCandles.length > 0) {
      const seen = new Set()
      const mapped = apiCandles
        .map((c) => ({
          time:   typeof c.time === 'number' ? c.time : Math.floor(new Date(c.open_time || c.time).getTime() / 1000),
          open:   Number(c.open),
          high:   Number(c.high),
          low:    Number(c.low),
          close:  Number(c.close),
          volume: Number(c.volume || 0),
        }))
        .filter((c) => c.open > 0 && c.high >= c.low)
        .sort((a, b) => a.time - b.time)
        .filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true })
      if (mapped.length > 0) return mapped
    }
    return generateSeedCandles(basePrice, interval, market.symbol)
  }, [apiCandles, market.symbol, interval, basePrice])

  // Helper: push candle data into all three series + track lastCandleRef
  function applyData(fit) {
    if (!candleData.length) return
    const ohlc = candleData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    const line = candleData.map(({ time, close }) => ({ time, value: close }))
    const vol  = candleData.map(({ time, volume, open, close }) => ({
      time, value: Math.max(volume, 0),
      color: close >= open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
    }))
    try {
      candleSeriesRef.current.setData(ohlc)
      areaSeriesRef.current.setData(line)
      volumeSeriesRef.current.setData(vol)
      if (fit) chartRef.current?.timeScale().fitContent()
    } catch {}
    // Track last candle so live tick can extend it
    lastCandleRef.current = { ...candleData[candleData.length - 1] }
  }

  // ── Full init: recreate chart when symbol or interval changes ──────────────
  useEffect(() => {
    if (!containerRef.current) return
    let active = true

    async function init() {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts')
      if (!active || !containerRef.current) return

      const isDark = document.documentElement.classList.contains('dark')
      const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
      const labelBg = isDark ? '#0f1117' : '#f8fafc'
      const borderColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'
      const textColor = isDark ? '#64748b' : '#94a3b8'

      const chart = createChart(containerRef.current, {
        autoSize: true,
        watermark: { visible: false },
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: gridColor },
          horzLines: { color: gridColor },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(251,191,36,0.5)', labelBackgroundColor: labelBg },
          horzLine: { color: 'rgba(251,191,36,0.5)', labelBackgroundColor: labelBg },
        },
        rightPriceScale: { borderColor, textColor },
        timeScale: {
          borderColor,
          textColor,
          timeVisible: true,
          secondsVisible: interval === '1m' || interval === '5m',
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      })

      if (!active) { chart.remove(); return }

      // Volume first (behind candles)
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      })
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

      // Binance-style colors: green = #26a69a, red = #ef5350
      const candleSeries = chart.addCandlestickSeries({
        upColor:          '#26a69a',
        downColor:        '#ef5350',
        borderUpColor:    '#26a69a',
        borderDownColor:  '#ef5350',
        wickUpColor:      '#26a69a',
        wickDownColor:    '#ef5350',
        visible:          chartType === 'candle',
        priceLineVisible: true,
        lastValueVisible: true,
      })

      const areaSeries = chart.addAreaSeries({
        lineColor:              '#f59e0b',
        topColor:               'rgba(245,158,11,0.2)',
        bottomColor:            'rgba(245,158,11,0.01)',
        lineWidth:              2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        priceLineVisible:       true,
        lastValueVisible:       true,
        visible:                chartType === 'line',
      })

      chartRef.current        = chart
      candleSeriesRef.current = candleSeries
      areaSeriesRef.current   = areaSeries
      volumeSeriesRef.current = volumeSeries

      applyData(true)
    }

    init()

    return () => {
      active = false
      if (chartRef.current) { try { chartRef.current.remove() } catch {} ; chartRef.current = null }
      candleSeriesRef.current = null
      areaSeriesRef.current   = null
      volumeSeriesRef.current = null
      lastCandleRef.current   = null
    }
  }, [market.symbol, interval]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update candle data without reinit (API refetch) ────────────────────────
  useEffect(() => {
    if (!candleSeriesRef.current || !areaSeriesRef.current || !volumeSeriesRef.current) return
    applyData(false) // don't fitContent on live refetch — keeps viewport stable
  }, [candleData]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle series visibility ───────────────────────────────────────────────
  useEffect(() => {
    try {
      candleSeriesRef.current?.applyOptions({ visible: chartType === 'candle' })
      areaSeriesRef.current?.applyOptions({ visible: chartType === 'line' })
    } catch {}
  }, [chartType])

  // ── Real-time live price tick ──────────────────────────────────────────────
  useEffect(() => {
    if (!livePrice || !lastCandleRef.current) return
    const step       = INTERVAL_SECONDS[interval] ?? 60
    const now        = Math.floor(Date.now() / 1000)
    const candleTime = Math.floor(now / step) * step
    const last       = lastCandleRef.current

    try {
      if (candleTime > last.time) {
        // New candle period
        lastCandleRef.current = { time: candleTime, open: livePrice, high: livePrice, low: livePrice, close: livePrice, volume: 0 }
        candleSeriesRef.current?.update({ time: candleTime, open: livePrice, high: livePrice, low: livePrice, close: livePrice })
        areaSeriesRef.current?.update({ time: candleTime, value: livePrice })
      } else {
        // Extend current candle
        const updated = { ...last, close: livePrice, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice) }
        lastCandleRef.current = updated
        candleSeriesRef.current?.update({ time: last.time, open: last.open, high: updated.high, low: updated.low, close: livePrice })
        areaSeriesRef.current?.update({ time: last.time, value: livePrice })
      }
    } catch {}
  }, [livePrice, interval])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Cover the TradingView canvas logo (bottom-left, ~80×36px) */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 88, height: 38, background: 'var(--t-panel)', zIndex: 9999 }} />
    </div>
  )
}
