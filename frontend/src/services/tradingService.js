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

  async getTradingPairs() {
    return apiClient.get('/market/pairs')
  }

  async getRecentTrades(pair, limit = 50) {
    return apiClient.get(`/market/trades/${pair.toUpperCase()}`, { limit })
  }
}

export const tradingService = new TradingService()
