'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Dashboard is an alias for the main trading page
export default function DashboardPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/')
  }, [router])
  return null
}
