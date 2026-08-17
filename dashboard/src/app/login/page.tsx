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
    <div
      className="flex items-center justify-center px-4"
      style={{ minHeight: 'calc(100vh / var(--ui-zoom))', background: 'hsl(var(--background))' }}
    >
      <div
        className="w-[380px] bg-card rounded-xl border border-[--border-subtle] px-9 py-10"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center justify-center rounded-lg mb-3.5"
            style={{ width: 48, height: 48, background: 'hsl(var(--sidebar-ring))', boxShadow: '0 0 0 2px var(--primary-focus-ring)' }}
          >
            <span className="text-white text-[18px] font-extrabold tracking-tight">TRS</span>
          </div>
          <h1 className="text-[18px] font-bold text-foreground tracking-tight m-0">
            Trade Risk Solutions
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1 m-0">Internal Dashboard</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 px-3.5 py-2.5 rounded-md" style={{ background: 'var(--error-bg)', border: '1px solid rgba(192,51,71,0.22)' }}>
            <p className="m-0 text-[12px]" style={{ color: 'var(--error)' }}>{error}</p>
          </div>
        )}

        {/* Sign in button */}
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-md border border-[--border-subtle] bg-card text-[14px] font-semibold text-foreground transition-shadow"
          style={{ boxShadow: 'var(--card-shadow)' }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-panel)')}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--card-shadow)')}
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

        <p className="mt-5 text-center text-[11px] text-muted-foreground/70 leading-relaxed">
          Only <strong className="text-muted-foreground">@trade-risksol.com</strong> accounts can access this dashboard.
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
