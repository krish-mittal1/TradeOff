'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function WithdrawPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/wallets')
  }, [router])
  return null
}
