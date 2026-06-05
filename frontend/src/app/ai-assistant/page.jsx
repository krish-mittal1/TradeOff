'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// ai-assistant/ redirects to /assistant
export default function AiAssistantRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/assistant')
  }, [router])
  return null
}
