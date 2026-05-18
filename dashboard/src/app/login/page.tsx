'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense }        from 'react'
import { createClient }   from '@/lib/supabase/client'

const ERROR_MESSAGES: Record<string, string> = {
  domain:   'Only @trade-risksol.com accounts are allowed.',
  oauth:    'Google sign-in was cancelled or failed. Please try again.',
  callback: 'Something went wrong during sign-in. Please try again.',
}

function LoginCard() {
  const params  = useSearchParams()
  const errorKey = params.get('error')
  const next    = params.get('next') ?? '/engagement'
  const error   = errorKey ? (ERROR_MESSAGES[errorKey] ?? 'Sign-in failed. Please try again.') : null

  async function signInWithGoogle() {
    const supabase    = createClient()
    const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options:  {
        redirectTo:  callbackUrl,
        queryParams: { hd: 'trade-risksol.com' }, // hint Google to pre-select TRS accounts
      },
    })
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f7f7f7', fontFamily: 'var(--font-archivo, system-ui, sans-serif)',
    }}>
      <div style={{
        width: 380, background: '#fff', borderRadius: 16,
        border: '1px solid #e8e8e8', boxShadow: '0 4px 32px rgba(0,0,0,0.07)',
        padding: '40px 36px',
      }}>
        {/* Logo / wordmark */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 12, background: '#111', marginBottom: 14,
          }}>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em' }}>TRS</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111', letterSpacing: '-0.02em' }}>
            Trade Risk Solutions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>Internal Dashboard</p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 20, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)',
          }}>
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{error}</p>
          </div>
        )}

        {/* Sign in button */}
        <button
          onClick={signInWithGoogle}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '12px 20px', borderRadius: 10, border: '1px solid #e0e0e0',
            background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#111',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'box-shadow 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)')}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p style={{ margin: '20px 0 0', textAlign: 'center', fontSize: 11, color: '#bbb', lineHeight: 1.5 }}>
          Only <strong style={{ color: '#888' }}>@trade-risksol.com</strong> accounts can access this dashboard.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  )
}
