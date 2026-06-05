'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Deep-link /trade/BTCUSDT → redirect to home (trading is on the main page)
export default function TradePairPage({ params }) {
  const router = useRouter()
  useEffect(() => {
    // The main trading page handles pair selection via query params in a future iteration.
    // For now, redirect to the main trading interface.
    router.replace('/')
  }, [router])
  return null
}
