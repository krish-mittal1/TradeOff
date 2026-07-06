import { apiClient } from './api'

class TradingService {
  async placeMarketOrder(pair, side, quantity = '0', quoteQuantity = '0') {
    return apiClient.post('/orders/market', {
      pair: pair.toUpperCase(),
      side: side.toUpperCase(),
      quantity,
      quote_quantity: quoteQuantity,
    })
  }

  async placeLimitOrder(pair, side, price, quantity, timeInForce = 'GTC') {
    return apiClient.post('/orders/limit', {
      pair: pair.toUpperCase(),
      side: side.toUpperCase(),
      price,
      quantity,
      time_in_force: timeInForce,
    })
  }

  async placeStopOrder(pair, side, stopPrice, quantity, price = null, timeInForce = 'GTC') {
    return apiClient.post('/orders/stop', {
      pair: pair.toUpperCase(),
      side: side.toUpperCase(),
      stop_price: stopPrice,
      quantity,
      price,
      time_in_force: timeInForce,
    })
  }

  async cancelOrder(orderId) {
    return apiClient.delete(`/orders/${orderId}`)
  }

  async getOrders(params = {}) {
    return apiClient.get('/orders', params)
  }

  async getTrades(params = {}) {
    return apiClient.get('/trades', params)
  }

  async getDepth(pair, limit = 100) {
    return apiClient.get(`/market/depth/${pair.toUpperCase()}`, { limit })
  }

  async getTicker(pair) {
    return apiClient.get(`/market/ticker/${pair.toUpperCase()}`)
  }

  async getCandles(pair, interval = '1m', limit = 500) {
    return apiClient.get('/market/candles', { pair: pair.toUpperCase(), interval, limit })
  }

  // Fetch real OHLCV data from Binance public REST (no auth needed)
  async getBinanceCandles(pair, interval = '1m', limit = 150) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${pair.toUpperCase()}&interval=${interval}&limit=${limit}`
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) return []
      const raw = await resp.json()
      return raw.map((k) => ({
        time:   Math.floor(k[0] / 1000),
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }))
    } catch {
      return []
    }
  }

  // Fetch real 24h ticker snapshot from Binance public REST
  async getBinanceTickers(symbols) {
    try {
      const param = JSON.stringify(symbols.map((s) => s.toUpperCase()))
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(param)}`
      const resp = await fetch(url, { cache: 'no-store' })
      if (!resp.ok) return []
      return await resp.json()
    } catch {
      return []
    }
  }

  async getTickers() {
    return apiClient.get('/market/tickers')
  }

  async getTradingPairs() {
    return apiClient.get('/market/pairs')
  }

  async getRecentTrades(pair, limit = 50) {
    return apiClient.get(`/market/trades/${pair.toUpperCase()}`, { limit })
  }
}

export const tradingService = new TradingService()
