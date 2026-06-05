'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function NotificationSettingsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/notifications')
  }, [router])
  return null
}
