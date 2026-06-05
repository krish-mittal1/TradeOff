'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// API key management lives under /profile
export default function ApiKeysSettingsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/profile#api-keys')
  }, [router])
  return null
}
