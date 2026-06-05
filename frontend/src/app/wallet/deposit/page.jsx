'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function DepositPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/wallets')
  }, [router])
  return null
}
