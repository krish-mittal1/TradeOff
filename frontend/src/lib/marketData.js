// Shared market seed data — single source of truth used by all pages
export const MARKET_SEED = [
  { symbol: 'BTCUSDT', base: 'BTC', price: 68429.12, change: 2.84, volume: '1.42B', high: 69800, low: 67100 },
  { symbol: 'ETHUSDT', base: 'ETH', price: 3641.87, change: 1.92, volume: '824.6M', high: 3720, low: 3580 },
  { symbol: 'BNBUSDT', base: 'BNB', price: 612.40, change: 0.84, volume: '412.1M', high: 625, low: 608 },
  { symbol: 'SOLUSDT', base: 'SOL', price: 172.46, change: -0.74, volume: '318.2M', high: 178, low: 170 },
  { symbol: 'XRPUSDT', base: 'XRP', price: 0.6245, change: 1.18, volume: '689.4M', high: 0.64, low: 0.61 },
  { symbol: 'ADAUSDT', base: 'ADA', price: 0.4518, change: 4.11, volume: '91.8M', high: 0.47, low: 0.43 },
  { symbol: 'DOGEUSDT', base: 'DOGE', price: 0.1682, change: -1.03, volume: '211.5M', high: 0.175, low: 0.163 },
  { symbol: 'AVAXUSDT', base: 'AVAX', price: 41.28, change: 2.06, volume: '122.7M', high: 42.5, low: 40.2 },
  { symbol: 'LINKUSDT', base: 'LINK', price: 18.74, change: 0.58, volume: '98.4M', high: 19.1, low: 18.5 },
  { symbol: 'DOTUSDT', base: 'DOT', price: 7.35, change: -0.22, volume: '76.2M', high: 7.55, low: 7.20 },
  { symbol: 'MATICUSDT', base: 'MATIC', price: 0.7124, change: 1.47, volume: '64.9M', high: 0.73, low: 0.70 },
  { symbol: 'LTCUSDT', base: 'LTC', price: 84.50, change: 0.31, volume: '54.1M', high: 86.0, low: 83.5 },
]

// Price by base asset — for portfolio valuation and BTC equivalents
export const SEED_PRICES = Object.fromEntries(
  [{ symbol: 'USDT', price: 1 }, ...MARKET_SEED.map((m) => ({ symbol: m.base, price: m.price }))]
    .map((x) => [x.symbol, x.price])
)

// Default virtual demo balances
export const DEMO_BALANCES = {
  USDT: 10000,
  BTC: 0.15,
  ETH: 2.0,
  BNB: 5.0,
  SOL: 25.0,
  XRP: 500,
  ADA: 1000,
  DOGE: 2000,
  AVAX: 30,
  LINK: 40,
  DOT: 80,
  MATIC: 500,
  LTC: 2,
}
