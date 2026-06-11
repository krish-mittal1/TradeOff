'use client'

import { useEffect, useRef, useMemo } from 'react'

// Generate realistic OHLCV seed candles for a given base price
function generateSeedCandles(basePrice, count = 120) {
  const candles = []
  const now = Math.floor(Date.now() / 1000)
  const interval = 60 // 1 minute in seconds
  let price = basePrice * 0.97

  for (let i = count; i >= 0; i--) {
    const time = now - i * interval
    const open = price
    const volatility = basePrice * 0.0015
    const change = (Math.random() - 0.48) * volatility + Math.sin(i * 0.3) * volatility * 0.5
    const close = Math.max(basePrice * 0.85, open + change)
    const high = Math.max(open, close) + Math.random() * volatility * 0.5
    const low = Math.min(open, close) - Math.random() * volatility * 0.5
    const volume = basePrice * (0.1 + Math.random() * 0.4)

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

  // Convert API candles or generate seed candles
  const candleData = useMemo(() => {
    if (apiCandles && apiCandles.length > 0) {
      return apiCandles.map((c) => ({
        time: typeof c.time === 'number' ? c.time : Math.floor(new Date(c.open_time || c.time).getTime() / 1000),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
      })).sort((a, b) => a.time - b.time)
    }
    return generateSeedCandles(market.price)
  }, [apiCandles, market.price])

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return
    let chart

    async function init() {
      const { createChart, ColorType, CrosshairMode } = await import('lightweight-charts')

      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#64748b',
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
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      })

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
        scaleMargins: { top: 0.8, bottom: 0 },
      })

      seriesRef.current = candleSeries
      volumeSeriesRef.current = volumeSeries
      chartRef.current = chart

      // Set data
      const ohlcData = candleData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
      const volData = candleData.map(({ time, volume, open, close }) => ({
        time,
        value: volume,
        color: close >= open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
      }))

      candleSeries.setData(ohlcData)
      volumeSeries.setData(volData)
      chart.timeScale().fitContent()

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          })
        }
      })
      ro.observe(containerRef.current)

      return () => ro.disconnect()
    }

    const cleanup = init()
    return () => {
      cleanup.then((fn) => fn?.())
      chart?.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [market.symbol]) // Re-init when pair changes

  // Update data when candles change (without full reinit)
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return
    const ohlcData = candleData.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    const volData = candleData.map(({ time, volume, open, close }) => ({
      time,
      value: volume,
      color: close >= open ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)',
    }))
    try {
      seriesRef.current.setData(ohlcData)
      volumeSeriesRef.current.setData(volData)
      chartRef.current?.timeScale().fitContent()
    } catch {
      // Chart may not be ready yet
    }
  }, [candleData])

  return <div ref={containerRef} className="h-full w-full" />
}
