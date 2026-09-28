'use client'

import { useEffect, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TeamUser } from '@/app/api/users/route'
import { PersonTag } from '@/components/board/TodoEditor'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'

/**
 * The team roster, as Alps Wills structures it: name and email, role, status, joined, and a
 * quiet row menu. Roles change in place; your own row is locked so an administrator cannot
 * demote or escalate themselves. Administrators invite by email; Supabase sends the mail.
 */

const INK = '#202124'
const MUTED = '#5f6368'
const RULE = '#e8eaed'
const ROLE_LABEL: Record<TeamUser['role'], string> = { administrator: 'Administrator', staff: 'Staff' }
const STATUS_LABEL: Record<TeamUser['status'], string> = { active: 'Active', invited: 'Invited', suspended: 'Suspended' }

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TeamTable() {
  const [users, setUsers] = useState<TeamUser[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    const r = await fetch('/api/users', { cache: 'no-store' })
    const d = await r.json()
    if (!r.ok) { setErr(d.error ?? 'Could not load the team.'); return }
    setUsers(d.users); setIsAdmin(!!d.me?.isAdmin); setErr(null)
  }
  useEffect(() => { void load() }, [])

  async function patch(userId: string, body: Record<string, unknown>, done: string) {
    setBusy(userId); setMenu(null)
    try {
      const r = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, ...body }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not save')
      setNotice(done); await load()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(null) }
  }
  async function invite() {
    setBusy('invite')
    try {
      const r = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Could not invite')
      setNotice(`Invitation sent to ${email.trim()}.`); setEmail(''); setName(''); setInviting(false); await load()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not invite') } finally { setBusy(null) }
  }

  const staffMap = new Map((users ?? []).map(u => [u.email, { email: u.email, name: u.name, actions: 0 }]))

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="m-0 text-[14px]" style={{ color: MUTED }}>{err ? '' : users ? `${users.length} ${users.length === 1 ? 'person' : 'people'} · ${users.filter(u => u.role === 'administrator').length} administrator${users.filter(u => u.role === 'administrator').length === 1 ? '' : 's'}` : 'Loading…'}</p>
        {isAdmin && !inviting && <button type="button" onClick={() => setInviting(true)} className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer inline-flex items-center gap-1.5" style={{ background: INK }}><Plus size={15} /> Invite</button>}
      </div>

      {inviting && (
        <div className="mb-4 rounded-[14px] p-4 flex items-end gap-3 flex-wrap" style={{ background: '#F5F5F3' }}>
          <label className="flex flex-col gap-1 text-[12.5px] flex-1 min-w-[200px]" style={{ color: MUTED }}>Work email<input autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="name@trade-risksol.com" className="h-10 rounded-[10px] border bg-white px-3.5 text-[14px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0', color: INK }} onKeyDown={e => { if (e.key === 'Enter') void invite() }} /></label>
          <label className="flex flex-col gap-1 text-[12.5px] flex-1 min-w-[160px]" style={{ color: MUTED }}>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" className="h-10 rounded-[10px] border bg-white px-3.5 text-[14px] outline-none focus:border-[#202124]" style={{ borderColor: '#dadce0', color: INK }} /></label>
          <button type="button" onClick={() => void invite()} disabled={busy === 'invite' || !email.trim()} className="h-10 px-4 rounded-[10px] text-white text-[14px] font-medium border-0 cursor-pointer disabled:opacity-50" style={{ background: INK }}>{busy === 'invite' ? 'Sending…' : 'Send invitation'}</button>
          <button type="button" onClick={() => setInviting(false)} className="h-10 px-3 rounded-[10px] text-[14px] bg-transparent border-0 cursor-pointer" style={{ color: MUTED }}>Cancel</button>
        </div>
      )}

      {notice && <p className="m-0 mb-3 text-[13.5px] inline-flex items-center gap-3" style={{ color: MUTED }} role="status">{notice} <button type="button" onClick={() => setNotice(null)} className="underline underline-offset-4 bg-transparent border-0 p-0 cursor-pointer" style={{ color: INK }}>Dismiss</button></p>}
      {err && <p className="m-0 mb-3 text-[13.5px]" style={{ color: MUTED }}>{err}</p>}

      <Register label="Team" minWidth={720}>
        <RegisterHead>
          <RegisterTh first hint="Name, and the email they sign in with">Name</RegisterTh>
          <RegisterTh hint="Administrators manage roles and invitations">Role</RegisterTh>
          <RegisterTh>Status</RegisterTh>
          <RegisterTh align="right" hint="Date the account was created">Joined</RegisterTh>
          <RegisterTh align="right" hint="Most recent sign-in">Last sign-in</RegisterTh>
          <RegisterTh last width={56}><span className="sr-only">Actions</span></RegisterTh>
        </RegisterHead>
        <tbody>
          {users === null && <RegisterEmpty colSpan={6}>Loading…</RegisterEmpty>}
          {users && users.length === 0 && <RegisterEmpty colSpan={6}>No one has signed in yet.</RegisterEmpty>}
          {(users ?? []).map(u => (
            <RegisterRow key={u.id} className={cn(busy === u.id && 'opacity-50')}>
              <RegisterCell first title={u.email}>
                <span className="flex items-center gap-3">
                  <PersonTag email={u.email} staff={staffMap} size="md" />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium leading-tight truncate" style={{ color: INK }}>{u.name}{u.isSelf && <span className="ml-1.5 text-[12px] font-normal" style={{ color: MUTED }}>(you)</span>}</span>
                    <span className="block text-[12.5px] mt-0.5 truncate" style={{ color: MUTED }}>{u.email}{u.gmail ? ` · Gmail connected` : ''}</span>
                  </span>
                </span>
              </RegisterCell>
              <RegisterCell>
                {isAdmin && !u.isSelf
                  ? <select value={u.role} onChange={e => void patch(u.id, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value as TeamUser['role']].toLowerCase()}.`)} aria-label={`Role for ${u.name}`} className="h-9 rounded-[8px] border bg-white px-2.5 text-[13.5px] cursor-pointer" style={{ borderColor: '#dadce0', color: INK }}>
                      {(['administrator', 'staff'] as const).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  : <span className="text-[14px]" style={{ color: INK }} title={u.isSelf ? 'You cannot change your own role. Ask another administrator.' : undefined}>{ROLE_LABEL[u.role]}</span>}
              </RegisterCell>
              <RegisterCell><span className="text-[14px]" style={{ color: '#3c4043' }}>{STATUS_LABEL[u.status]}</span></RegisterCell>
              <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: INK }}>{when(u.joinedAt)}</span></RegisterCell>
              <RegisterCell align="right"><span className="text-[14px] tabular-nums" style={{ color: INK }}>{when(u.lastSignInAt)}</span></RegisterCell>
              <RegisterCell last align="right">
                {isAdmin && !u.isSelf && u.status !== 'invited' && (
                  <span className="relative inline-block">
                    <button type="button" onClick={() => setMenu(menu === u.id ? null : u.id)} aria-label={`Actions for ${u.name}`} aria-expanded={menu === u.id} className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4]" style={{ color: MUTED }}><MoreHorizontal size={16} /></button>
                    {menu === u.id && (
                      <span className="absolute right-0 top-full mt-1 w-44 rounded-[12px] bg-white p-1.5 z-10 text-left" style={{ border: `1px solid ${RULE}`, boxShadow: '0 12px 32px rgba(32,33,36,0.12)' }}>
                        <button type="button" onClick={() => void patch(u.id, { suspended: u.status !== 'suspended' }, u.status === 'suspended' ? `${u.name} reactivated.` : `${u.name} suspended.`)} className="w-full text-left px-3 py-2 rounded-[8px] text-[13.5px] bg-transparent border-0 cursor-pointer hover:bg-[#f8f9fa]" style={{ color: INK }}>{u.status === 'suspended' ? 'Reactivate' : 'Suspend'}</button>
                      </span>
                    )}
                  </span>
                )}
              </RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
      {!isAdmin && users && <p className="m-0 mt-3 text-[12.5px]" style={{ color: MUTED }}>Roles and invitations are managed by an administrator.</p>}
    </div>
  )
}
