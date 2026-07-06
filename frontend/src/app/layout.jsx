import './globals.css'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AuthProvider } from '@/providers/AuthProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { Web3Provider } from '@/providers/Web3Provider'
import { WebSocketProvider } from '@/providers/WebSocketProvider'

export const metadata = {
  title: 'TradeOff — Crypto Exchange Simulator',
  description: 'A production-grade crypto exchange simulator with real-time spot trading, candlestick charts, order books, portfolio tracking, and WebSocket market data.',
  icons: { icon: '/favicon.svg' },
  robots: { index: false, follow: false },
  openGraph: {
    title: 'TradeOff — Crypto Exchange Simulator',
    description: 'Practice crypto trading risk-free with real-time charts, order matching, and portfolio tracking.',
    type: 'website',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-[#070a0f] font-sans antialiased">
        <ErrorBoundary>
          <ThemeProvider>
            <QueryProvider>
              <AuthProvider>
                <Web3Provider>
                  <WebSocketProvider>
                    {children}
                  </WebSocketProvider>
                </Web3Provider>
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
