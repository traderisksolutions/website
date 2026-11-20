'use client'

import { useEffect, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Btn, inputCls } from '@/components/crm/primitives'
import { PersonTag } from '@/components/board/TodoEditor'
import { Register, RegisterHead, RegisterTh, RegisterRow, RegisterCell, RegisterEmpty } from '@/components/ui/register'
import { unwrap } from '@/lib/action-result'
import { addTeamMember, changeAccess, team, type TeamUser } from '@/app/settings/actions'

/**
 * The staff roster: name and email, role, access, joined, and a quiet row menu. Roles change in
 * place; your own row is locked so an administrator cannot demote or lock out themselves.
 *
 * Rewritten on 2 Oct 2026 with the API behind it. There is no invitation any more — Supabase
 * Auth sent those and Supabase is gone. Sign-in is Google on the TRS domain, so adding somebody
 * here is what makes them known to it, and switching access off is what stops them: lookupStaff()
 * filters on active, so this is a real gate and not a label.
 *
 * "Last sign-in" is also gone, because nothing records one. A column of em-dashes would say we
 * track it when we do not.
 */

const ROLE_LABEL: Record<TeamUser['role'], string> = { administrator: 'Administrator', staff: 'Staff' }
const ACCESS_LABEL = (active: boolean) => (active ? 'Active' : 'No access')

function when(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TeamTable() {
  const [users, setUsers] = useState<TeamUser[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    const r = await team()
    if (!r.ok) { setErr(r.error); return }
    const d = r.data
    setUsers(d.users); setIsAdmin(!!d.me?.isAdmin); setErr(null)
  }
  useEffect(() => { void load() }, [])

  async function patch(userId: string, body: Record<string, unknown>, done: string) {
    setBusy(userId); setMenu(null)
    try {
      unwrap(await changeAccess({ userId, ...body }))
      setNotice(done); await load()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not save') } finally { setBusy(null) }
  }
  async function add() {
    setBusy('add')
    try {
      unwrap(await addTeamMember(email, name))
      setNotice(`${email.trim()} can now sign in with Google.`); setEmail(''); setName(''); setAdding(false); await load()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not add') } finally { setBusy(null) }
  }

  const staffMap = new Map((users ?? []).map(u => [u.email, { email: u.email, name: u.name, actions: 0 }]))

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="m-0 text-body text-trs-muted">{err ? '' : users ? `${users.length} ${users.length === 1 ? 'person' : 'people'} · ${users.filter(u => u.role === 'administrator').length} administrator${users.filter(u => u.role === 'administrator').length === 1 ? '' : 's'}` : 'Loading…'}</p>
        {isAdmin && !adding && <Btn level="primary" onClick={() => setAdding(true)}><Plus size={15} /> Add person</Btn>}
      </div>

      {adding && (
        <div className="mb-4 rounded p-4 flex items-end gap-3 flex-wrap bg-trs-canvas">
          <label className="flex flex-col gap-1 text-small flex-1 min-w-[200px] text-trs-muted">Work email<input autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="name@trade-risksol.com" className={inputCls} onKeyDown={e => { if (e.key === 'Enter') void add() }} /></label>
          <label className="flex flex-col gap-1 text-small flex-1 min-w-[160px] text-trs-muted">Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" className={inputCls} /></label>
          <Btn level="primary" onClick={() => void add()} disabled={busy === 'add' || !email.trim()}>{busy === 'add' ? 'Adding…' : 'Add to roster'}</Btn>
          <Btn level="tertiary" onClick={() => setAdding(false)}>Cancel</Btn>
        </div>
      )}

      {notice && <p className="m-0 mb-3 text-body inline-flex items-center gap-3 text-trs-muted" role="status">{notice} <Btn level="tertiary" onClick={() => setNotice(null)} className="h-auto p-0 border-0 font-normal underline underline-offset-4 text-trs-ink hover:bg-transparent">Dismiss</Btn></p>}
      {err && <p className="m-0 mb-3 text-body text-trs-muted">{err}</p>}

      <Register label="Team" minWidth={720}>
        <RegisterHead>
          <RegisterTh first hint="Name, and the email they sign in with">Name</RegisterTh>
          <RegisterTh hint="Administrators manage roles and the roster">Role</RegisterTh>
          <RegisterTh hint="No access means sign-in is refused, not just hidden">Access</RegisterTh>
          <RegisterTh align="right" hint="Date they were added to the roster">Added</RegisterTh>
          <RegisterTh last width={56}><span className="sr-only">Actions</span></RegisterTh>
        </RegisterHead>
        <tbody>
          {users === null && <RegisterEmpty colSpan={5}>Loading…</RegisterEmpty>}
          {users && users.length === 0 && <RegisterEmpty colSpan={5}>No one has signed in yet.</RegisterEmpty>}
          {(users ?? []).map(u => (
            <RegisterRow key={u.id} className={cn(busy === u.id && 'opacity-50')}>
              <RegisterCell first title={u.email}>
                <span className="flex items-center gap-3">
                  <PersonTag email={u.email} staff={staffMap} size="md" />
                  <span className="min-w-0">
                    <span className="block text-body font-medium leading-tight truncate text-trs-ink">{u.name}{u.isSelf && <span className="ml-1.5 text-small font-normal text-trs-muted">(you)</span>}</span>
                    <span className="block text-small mt-0.5 truncate text-trs-muted">{u.email}</span>
                  </span>
                </span>
              </RegisterCell>
              <RegisterCell>
                {isAdmin && !u.isSelf
                  ? <select value={u.role} onChange={e => void patch(u.id, { role: e.target.value }, `${u.name} is now ${ROLE_LABEL[e.target.value as TeamUser['role']].toLowerCase()}.`)} aria-label={`Role for ${u.name}`} className="h-9 rounded border bg-white px-2.5 text-body cursor-pointer border-trs-line-2 text-trs-ink">
                      {(['administrator', 'staff'] as const).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  : <span className="text-body text-trs-ink" title={u.isSelf ? 'You cannot change your own role. Ask another administrator.' : undefined}>{ROLE_LABEL[u.role]}</span>}
              </RegisterCell>
              <RegisterCell><span className={u.active ? 'text-body text-trs-ink-2' : 'text-body text-trs-neg'}>{ACCESS_LABEL(u.active)}</span></RegisterCell>
              <RegisterCell align="right"><span className="text-body tabular-nums text-trs-ink">{when(u.joinedAt)}</span></RegisterCell>
              <RegisterCell last align="right">
                {isAdmin && !u.isSelf && (
                  <span className="relative inline-block">
                    <Btn level="tertiary" size="xs" onClick={() => setMenu(menu === u.id ? null : u.id)} aria-label={`Actions for ${u.name}`} aria-expanded={menu === u.id} className="w-8 h-8 p-0 rounded-full border-0 hover:bg-trs-field"><MoreHorizontal size={16} /></Btn>
                    {menu === u.id && (
                      <span className="absolute right-0 top-full mt-1 w-44 rounded bg-white p-1.5 z-10 text-left border border-trs-line shadow-[0_12px_32px_rgba(15,20,18,0.12)]">
                        <Btn level="tertiary" onClick={() => void patch(u.id, { active: !u.active }, u.active ? `${u.name} can no longer sign in.` : `${u.name} can sign in again.`)} className="w-full h-auto justify-start text-left px-3 py-2 border-0 font-normal text-trs-ink hover:bg-trs-tint hover:text-trs-ink">{u.active ? 'Remove access' : 'Restore access'}</Btn>
                      </span>
                    )}
                  </span>
                )}
              </RegisterCell>
            </RegisterRow>
          ))}
        </tbody>
      </Register>
      {!isAdmin && users && <p className="m-0 mt-3 text-small text-trs-muted">Roles and the roster are managed by an administrator.</p>}
    </div>
  )
}
