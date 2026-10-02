'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import SignaturePanel from '@/components/SignaturePanel'
import { TeamTable } from '@/components/settings/TeamTable'
import { VoicePanel } from '@/components/settings/VoicePanel'

/**
 * Settings, structured as Alps Wills structures it: one page, a nav of sections on the left,
 * each section a flat block on the right. Team lives here now (the old Team page redirects).
 */

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'

// Insurers, RFQ, Email templates and How it works were removed on 2 Oct 2026. Insurers now live
// under Companies → Insurers, where every distinct insurer already had a company record; the RFQ
// flow and its templates were retired everywhere, not only here.
type Section = 'profile' | 'team' | 'signatures' | 'voice'
const SECTIONS: { key: Section; label: string; group: 'you' | 'team' | 'agents' }[] = [
  { key: 'profile',    label: 'Your profile',   group: 'you' },
  { key: 'signatures', label: 'Signatures',     group: 'you' },
  { key: 'team',       label: 'Team',           group: 'team' },
  { key: 'voice',      label: 'Tone of voice',  group: 'agents' },
]
const GROUP_LABEL = { you: 'You', team: 'Team', agents: 'Agents' } as const

interface Profile { id: string; email?: string | null; is_admin: boolean; gmail_email: string | null }
const ERROR_MSGS: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled.',
  token: 'Failed to exchange the Google auth code. Try again.',
  no_refresh_token: 'No refresh token returned — revoke TRS access in your Google account settings and reconnect.',
  db: 'Failed to save the connection. Contact your administrator.',
}

export default function SettingsPage() {
  return <Suspense fallback={null}><SettingsInner /></Suspense>
}

function SettingsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const section = (SECTIONS.some(s => s.key === params.get('section')) ? params.get('section') : 'profile') as Section
  const setSection = (s: Section) => router.replace(`/settings${s === 'profile' ? '' : `?section=${s}`}`, { scroll: false })
  const [profile, setProfile] = useState<Profile | null>(null)
  async function loadProfile() { const r = await fetch('/api/auth/profile', { cache: 'no-store' }); if (r.ok) setProfile(await r.json()) }
  useEffect(() => { void loadProfile() }, [])
  const active = SECTIONS.find(s => s.key === section)!

  return (
    <div className="min-h-[calc(100vh-56px)] bg-white" style={{ color: INK, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div className="mx-auto max-w-[1200px] px-6 sm:px-12 pt-12 pb-20">
        <h1 className="m-0 text-[36px] font-medium tracking-[-0.03em] leading-[1.08]">Settings</h1>

        <div className="mt-10 grid gap-10 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* Internal nav */}
          <nav aria-label="Settings sections" className="md:sticky md:top-20 self-start">
            {(['you', 'team', 'agents'] as const).map(g => (
              <div key={g} className="mb-5">
                <p className="m-0 mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: '#9aa0a6' }}>{GROUP_LABEL[g]}</p>
                <ul className="m-0 p-0 list-none flex md:flex-col gap-0.5 overflow-x-auto">
                  {SECTIONS.filter(s => s.group === g).map(s => {
                    const on = section === s.key
                    return (
                      <li key={s.key} className="flex-shrink-0">
                        <button type="button" onClick={() => setSection(s.key)} aria-current={on ? 'page' : undefined}
                          className={cn('relative w-full text-left h-9 px-3 rounded-[8px] border-0 cursor-pointer text-[14px]', on ? 'font-medium' : 'hover:bg-[#f1f3f4]')} style={{ color: on ? INK : MUTED, background: on ? '#f1f3f4' : undefined }}>
                          {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: INK }} aria-hidden />}
                          {s.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Section */}
          <section className="min-w-0" aria-label={active.label}>
            <h2 className="m-0 text-[24px] font-medium tracking-[-0.02em]">{active.label}</h2>
            {section === 'profile' && <ProfileSection profile={profile} onChange={loadProfile} />}
            {section === 'team' && <TeamTable />}
            {section === 'signatures' && <SignaturePanel profile={profile} />}
            {section === 'voice' && <VoicePanel isAdmin={!!profile?.is_admin} />}
          </section>
        </div>
      </div>
    </div>
  )
}

function ProfileSection({ profile, onChange }: { profile: Profile | null; onChange: () => void }) {
  const params = useSearchParams()
  const [disconnecting, setDisconnecting] = useState(false)
  const gmailError = params.get('gmail_error')
  const gmailConnected = params.get('gmail_connected') === '1'
  async function disconnect() { setDisconnecting(true); try { await fetch('/api/auth/gmail/disconnect', { method: 'DELETE' }); onChange() } finally { setDisconnecting(false) } }
  return (
    <div className="flex flex-col gap-6">
      <Block title="Account">
        {!profile ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p> : (
          <dl className="m-0 grid grid-cols-[140px_1fr] gap-y-2 text-[14px]">
            <dt style={{ color: MUTED }}>Signed in as</dt><dd className="m-0" style={{ color: INK }}>{profile.email ?? '—'}</dd>
            <dt style={{ color: MUTED }}>Role</dt><dd className="m-0" style={{ color: INK }}>{profile.is_admin ? 'Administrator' : 'Staff'}</dd>
          </dl>
        )}
      </Block>
      <Block title="Gmail for sending">
        {gmailError && <p className="m-0 mb-3 text-[13.5px]" style={{ color: '#3c4043' }}>{ERROR_MSGS[gmailError] ?? 'Connection failed. Please try again.'}</p>}
        {gmailConnected && !gmailError && <p className="m-0 mb-3 text-[13.5px]" style={{ color: '#3c4043' }}>Gmail connected. Add your signature under Signatures.</p>}
        {!profile ? <p className="m-0 text-[14px]" style={{ color: MUTED }}>Loading…</p> : profile.gmail_email ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="m-0 text-[14px]" style={{ color: INK }}>Connected · {profile.gmail_email}</p>
            <button type="button" onClick={() => void disconnect()} disabled={disconnecting} className="h-9 px-3.5 rounded-[10px] bg-white text-[13.5px] border cursor-pointer disabled:opacity-50" style={{ borderColor: '#dadce0', color: INK }}>{disconnecting ? 'Removing…' : 'Disconnect'}</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="m-0 text-[14px]" style={{ color: MUTED }}>Not connected. Replies send from the shared address.</p>
            <a href="/api/auth/gmail/connect" className="h-9 px-4 rounded-[10px] text-white text-[13.5px] font-medium no-underline inline-flex items-center" style={{ background: INK }}>Connect Gmail</a>
          </div>
        )}
        <p className="m-0 mt-3 text-[12.5px]" style={{ color: MUTED }}>A separate Google grant with the send scope only. Message content is never stored — only a token for sending.</p>
      </Block>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] px-6 py-5" style={{ border: `1px solid ${RULE}` }}>
      <h3 className="m-0 mb-3 text-[16px] font-medium" style={{ color: INK }}>{title}</h3>
      {children}
    </div>
  )
}
