'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Leaderboard is exposed under /copy-trading
export default function LeaderboardPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/copy-trading')
  }, [router])
  return null
}
