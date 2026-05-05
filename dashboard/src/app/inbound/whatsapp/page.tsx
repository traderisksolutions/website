'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function WhatsAppPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/inbound/email?filter=whatsapp')
  }, [router])
  return null
}
