'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// Security settings (MFA etc.) live under /profile
export default function SecuritySettingsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/profile')
  }, [router])
  return null
}
