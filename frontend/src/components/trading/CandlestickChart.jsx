'use client'

import { useEffect, useRef, useMemo } from 'react'
import { MARKET_SEED } from '@/lib/marketData'

// Deterministic seed price for a given symbol (avoids flickering from live price changes)
function getSeedPrice(symbol) {
  return MARKET_SEED.find((m) => m.symbol === symbol)?.price || 1000
}

// Generate realistic OHLCV seed candles for a given base price
function generateSeedCandles(basePrice, count = 120) {
  const candles = []
  const now = Math.floor(Date.now() / 1000)
  const interval = 60 // 1 minute in seconds
  let price = basePrice * 0.97

  // Use a simple deterministic walk so candles don't re-randomize on re-render
  for (let i = count; i >= 0; i--) {
    const time = now - i * interval
    const open = price
    const volatility = basePrice * 0.0015
    // Deterministic oscillation + slight upward bias
    const change = Math.sin(i * 0.37) * volatility * 0.7 + Math.cos(i * 0.19) * volatility * 0.4
    const close = Math.max(basePrice * 0.85, open + change)
    const high = Math.max(open, close) + Math.abs(Math.sin(i * 0.53)) * volatility * 0.4
    const low = Math.min(open, close) - Math.abs(Math.cos(i * 0.71)) * volatility * 0.4
    const volume = basePrice * (0.15 + Math.abs(Math.sin(i * 0.29)) * 0.35)

    candles.push({ time, open, high, low, close, volume })
    price = close
  }
  return candles
}

export function CandlestickChart({ market, candles: apiCandles }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)

  // Compute display candles — keyed on symbol so seed candles don't regenerate on every price tick
  const candleData = useMemo(() => {
    if (apiCandles && apiCandles.length > 0) {
      const mapped = apiCandles.map((c) => ({
        time: typeof c.time === 'number' ? c.time : Math.floor(new Date(c.open_time || c.time).getTime() / 1000),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
      })).sort((a, b) => a.time - b.time)

      // Deduplicate timestamps (API sometimes returns duplicates)
      const seen = new Set()
      return mapped.filter((c) => {
        if (seen.has(c.time)) return false
        seen.add(c.time)
        return true
      })
    }
    // Fall back to deterministic seed candles (stable per symbol)
    return generateSeedCandles(getSeedPrice(market.symbol))
  }, [apiCandles, market.symbol]) // NOTE: intentionally NOT depending on market.price to avoid re-render on every live tick

  // Initialize chart — re-runs only when the trading pair changes
  useEffect(() => {
    if (!containerRef.current) return

    let active = true
    const roRef = { current: null }

    async function init() {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts')

      // Bail if the effect was cleaned up while the import was loading
      if (!active || !containerRef.current) return

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#64748b',
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(255,255,255,0.03)' },
          horzLines: { color: 'rgba(255,255,255,0.03)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(251,191,36,0.3)', labelBackgroundColor: '#1a1f2e' },
          horzLine: { color: 'rgba(251,191,36,0.3)', labelBackgroundColor: '#1a1f2e' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.05)',
          textColor: '#64748b',
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.05)',
          textColor: '#64748b',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      })

      // Bail if cleaned up between the await and now — remove the partially-created chart
      if (!active) {
        chart.remove()
        return
      }

      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      })

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      })

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      })

      // Store refs only after successful creation
      chartRef.current = chart
      seriesRef.current = candleSeries
      volumeSeriesRef.current = volumeSeries

      // Set initial data
      const ohlcData = candleData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
      const volData = candleData.map(({ time, volume, open, close }) => ({
        time,
        value: volume,
        color: close >= open ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
      }))

      try {
        candleSeries.setData(ohlcData)
        volumeSeries.setData(volData)
        chart.timeScale().fitContent()
      } catch {
        // Data may be empty or malformed — chart still renders, just without data
      }

      // ResizeObserver as a fallback for containers that don't trigger autoSize
      if (!containerRef.current) return
      roRef.current = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          try {
            chartRef.current.applyOptions({
              width: containerRef.current.clientWidth,
              height: containerRef.current.clientHeight,
            })
          } catch {}
        }
      })
      roRef.current.observe(containerRef.current)
    }

    init()

    return () => {
      active = false
      roRef.current?.disconnect()
      if (chartRef.current) {
        try { chartRef.current.remove() } catch {}
        chartRef.current = null
      }
      seriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [market.symbol]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update candle data without reinitializing the chart (triggered by API/WS updates)
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current || !chartRef.current) return

    const ohlcData = candleData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    const volData = candleData.map(({ time, volume, open, close }) => ({
      time,
      value: volume,
      color: close >= open ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)',
    }))

    try {
      seriesRef.current.setData(ohlcData)
      volumeSeriesRef.current.setData(volData)
      chartRef.current.timeScale().fitContent()
    } catch {
      // Chart may be in the middle of reinitializing
    }
  }, [candleData])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
