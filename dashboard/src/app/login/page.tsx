'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense }        from 'react'

const INK = '#202124'
const MUTED = '#5f6368'

const ERROR_MESSAGES: Record<string, string> = {
  domain:   'Only @trade-risksol.com accounts are allowed.',
  oauth:    'Google sign-in was cancelled or failed. Please try again.',
  callback: 'Sign-in did not complete. Please try again.',
}

function LoginCard() {
  const params  = useSearchParams()
  const errorKey = params.get('error')
  const next    = params.get('next') ?? '/engagement'
  const error   = errorKey ? (ERROR_MESSAGES[errorKey] ?? 'Sign-in failed. Please try again.') : null

  function signInWithGoogle() {
    // The authorization URL is built server-side so the OAuth client secret stays there.
    window.location.href = `/auth/signin?next=${encodeURIComponent(next)}`
  }

  return (
    <div
      className="flex items-center justify-center px-4 bg-white"
      style={{ minHeight: 'calc(100vh / var(--ui-zoom))', color: INK }}
    >
      <div className="w-full max-w-[400px] bg-white rounded-[16px] px-9 py-10" style={{ border: '1px solid #e8eaed' }}>
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-[12px] mb-4 w-12 h-12" style={{ background: INK }}>
            <span className="text-white text-[16px] font-medium tracking-[-0.01em]">TRS</span>
          </div>
          <h1 className="m-0 text-[24px] font-medium tracking-[-0.02em] leading-tight" style={{ color: INK }}>
            Trade Risk Solutions
          </h1>
          <p className="m-0 mt-1.5 text-[14px]" style={{ color: MUTED }}>Internal dashboard</p>
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className="m-0 mb-5 text-[13.5px] text-center leading-relaxed" style={{ color: '#3c4043' }}>{error}</p>
        )}

        {/* Sign in button */}
        <button
          type="button"
          onClick={signInWithGoogle}
          className="w-full h-12 inline-flex items-center justify-center gap-2.5 px-5 rounded-[12px] bg-white text-[15px] font-medium cursor-pointer hover:bg-[#f8f9fa] transition-colors"
          style={{ border: '1px solid #dadce0', color: INK }}
        >
          {/* Google logo: the brand mark, not UI state colour */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <p className="m-0 mt-5 text-center text-[13px] leading-relaxed" style={{ color: MUTED }}>
          Only @trade-risksol.com accounts can sign in.
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
