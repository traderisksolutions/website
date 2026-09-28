'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function WhatsAppPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/inbound/email?filter=whatsapp')
  }, [router])
  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: '#202124' }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <p className="m-0 text-[15px]" style={{ color: '#5f6368' }}>Opening WhatsApp leads…</p>
      </div>
    </div>
  )
}
