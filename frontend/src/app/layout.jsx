import './globals.css'
import { AuthProvider } from '@/providers/AuthProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { WebSocketProvider } from '@/providers/WebSocketProvider'

export const metadata = {
  title: 'TradeOff - Production-Style Exchange Simulator',
  description: 'A portfolio-grade centralized exchange simulator with spot trading, wallets, risk controls, realtime market data, and admin operations.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fallback.css" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <WebSocketProvider>
                {children}
              </WebSocketProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
