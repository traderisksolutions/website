'use server'
/**
 * Settings (21 Nov 2026): app settings, tone of voice, document checklists, the renewal method,
 * client forms, email signatures, the team and the signed-in person's Gmail link. They replace
 * /api/settings, /settings/voice, /settings/checklists, /methods/[key], /forms, /signatures,
 * /signatures/[id], /users, /auth/profile and /auth/gmail/disconnect.
 *
 * Every action needs a TRS session; /api/settings had none of its own. Changing shared things
 * (voice, method, forms, shared senders, the team) needs an administrator, as before.
 */
import { staffAction } from '@/lib/auth/action'
import { isAdmin } from '@/lib/auth/admin'
import { db, rows, one } from '@/lib/db/client'
import { logActivity } from '@/lib/log-activity'
import { DEFAULT_SOUL, VOICE_KEY, invalidateVoice } from '@/lib/voice'
import { addItem, addList, confirmList, editItem, listChecklists } from '@/lib/cases/brief-store'
import { currentStaff } from '@/lib/casework/queue'
import { DOC_TYPES } from '@/lib/documents/taxonomy'
import { DEFAULT_RENEWAL_METHOD, METHOD_KEYS, clearMethodCache, parseMethod, type MethodKey } from '@/lib/methods/method'
import { clearFormsCache } from '@/lib/forms/library'
import { isValidProductLine } from '@/lib/product-lines'
import { ALLOWED_DOMAIN } from '@/lib/auth/session'

async function requireAdmin(userId: string, refusal: string) {
  if (!(await isAdmin(userId))) throw new Error(refusal)
}

// ── App settings ────────────────────────────────────────────────────────────

const ADMIN_ONLY_KEYS = ['shared_email_senders', 'reply_from_email', 'voice_soul']

export async function getSetting(key: string) {
  return staffAction('get setting', async () => {
    const row = await one<{ key: string; value: string | null }>('Setting', db().from('app_settings').select('key, value').eq('key', key).maybeSingle())
    return row ?? { key, value: null }
  })
}

export async function setSetting(key: string, value: string) {
  return staffAction('set setting', async user => {
    if (!key) throw new Error('key required')
    if (ADMIN_ONLY_KEYS.includes(key)) await requireAdmin(user.id, 'Admin access required')
    const row = await one<{ key: string; value: string | null }>('Save setting', db().from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' }).select('key, value').single())
    return row
  })
}

// ── Tone of voice ───────────────────────────────────────────────────────────

const MAX_VOICE = 20_000

async function storedVoice() {
  return (await one<{ value: string | null; updated_at: string | null }>('Voice',
    db().from('app_settings').select('value, updated_at').eq('key', VOICE_KEY).maybeSingle())) ?? { value: null, updated_at: null }
}

export async function voiceSettings() {
  return staffAction('voice', async () => {
    const row = await storedVoice()
    return { text: row.value?.trim() ? row.value : DEFAULT_SOUL, isDefault: !row.value?.trim(), updatedAt: row.updated_at, defaultText: DEFAULT_SOUL }
  })
}

export async function saveVoice(text: string) {
  return staffAction('save voice', async user => {
    await requireAdmin(user.id, 'Only an administrator can change the tone of voice.')
    const next = (text ?? '').replace(/\r\n/g, '\n').trim()
    if (!next) throw new Error('The tone of voice cannot be empty. Use Restore default instead.')
    if (next.length > MAX_VOICE) throw new Error(`Keep it under ${MAX_VOICE.toLocaleString()} characters. It is ${next.length.toLocaleString()}.`)
    const before = await storedVoice()
    const updatedAt = new Date().toISOString()
    const { error } = await db().from('app_settings').upsert({ key: VOICE_KEY, value: next, updated_at: updatedAt }, { onConflict: 'key' })
    if (error) throw new Error(error.message)
    invalidateVoice()
    void logActivity({ action: 'voice.updated', resource_type: 'app_settings', resource_id: VOICE_KEY, old_value: { text: before.value ?? DEFAULT_SOUL }, new_value: { text: next } })
    return { updatedAt }
  })
}

export async function restoreDefaultVoice() {
  return staffAction('restore voice', async user => {
    await requireAdmin(user.id, 'Only an administrator can change the tone of voice.')
    const before = await storedVoice()
    const { error } = await db().from('app_settings').delete().eq('key', VOICE_KEY)
    if (error) throw new Error(error.message)
    invalidateVoice()
    void logActivity({ action: 'voice.restored_default', resource_type: 'app_settings', resource_id: VOICE_KEY, old_value: { text: before.value } })
    return { text: DEFAULT_SOUL }
  })
}

// ── Document checklists ─────────────────────────────────────────────────────

async function checklistView() {
  const [lists, staff] = await Promise.all([listChecklists(), currentStaff()])
  return { lists, staff, doc_types: DOC_TYPES.map(t => ({ slug: t.slug, label: t.label })) }
}

export async function checklists() {
  return staffAction('checklists', async () => checklistView())
}

/** Adds a list for a line, adds a document to it, or confirms it. Returns the checklists after. */
export async function changeChecklist(body: Record<string, unknown>) {
  return staffAction('change checklist', async user => {
    const line = typeof body.line === 'string' ? body.line : ''
    if (!line) throw new Error('Choose a line of insurance.')
    if (body.action === 'list') await addList(line, user.email)
    else if (body.action === 'item') await addItem(line, body, user.email)
    else if (body.action === 'confirm') await confirmList(line, user.email)
    else throw new Error('Unknown action.')
    return checklistView()
  })
}

export async function editChecklistItem(id: string, patch: Record<string, unknown>) {
  return staffAction('edit checklist item', async user => {
    if (!id) throw new Error('Name the document.')
    await editItem(id, patch, user.email)
    return checklistView()
  })
}

// ── The renewal method ──────────────────────────────────────────────────────

const isMethodKey = (k: string): k is MethodKey => (METHOD_KEYS as readonly string[]).includes(k)
type MethodRow = { version: number; text: string; created_by: string | null; created_at: string }

/** The method's versions and one of them (the latest by default), parsed. */
export async function methodVersions(key: string, version?: number) {
  return staffAction('method', async () => {
    if (!isMethodKey(key)) throw new Error('Unknown method')
    const versions = await rows<Omit<MethodRow, 'text'>>('Method versions',
      db().from('agent_methods').select('version, created_by, created_at').eq('key', key).order('version', { ascending: false }).limit(200))
    let q = db().from('agent_methods').select('version, text, created_by, created_at').eq('key', key)
    if (version && version > 0) q = q.eq('version', version)
    const row = await one<MethodRow>('Method', q.order('version', { ascending: false }).limit(1).maybeSingle())
    const text = row?.text ?? DEFAULT_RENEWAL_METHOD
    return { current: row ?? null, versions, parsed: parseMethod(text, row?.version ?? null), text, isDefault: !row }
  })
}

/** Saves a new version from `text`, or restores version `restore` as a new version. */
export async function saveMethod(key: string, body: { text?: string; restore?: number }) {
  return staffAction('save method', async user => {
    if (!isMethodKey(key)) throw new Error('Unknown method')
    await requireAdmin(user.id, 'Only an administrator can change the renewal method.')
    let text: string
    if (body.restore !== undefined) {
      const n = Math.floor(Number(body.restore))
      const row = n > 0 ? await one<{ text: string }>('Method version', db().from('agent_methods').select('text').eq('key', key).eq('version', n).maybeSingle()) : null
      if (!row) throw new Error(`Version ${String(body.restore)} not found`)
      text = row.text
    } else if (typeof body.text === 'string') text = body.text
    else throw new Error('text or restore required')
    text = text.replace(/\r\n?/g, '\n').trim() + '\n'
    if (text.length < 40 || text.length > 100_000) throw new Error('The method must be between 40 and 100,000 characters')
    if (!/^# Thresholds/m.test(text)) throw new Error('Keep the "# Thresholds" section: the rules read it')
    const last = await one<{ version: number }>('Last method', db().from('agent_methods').select('version').eq('key', key).order('version', { ascending: false }).limit(1).maybeSingle())
    const version = (last?.version ?? 0) + 1
    const { error } = await db().from('agent_methods').insert({ key, version, text, created_by: user.email })
    if (error) throw new Error(error.message)
    clearMethodCache()
    return { version, parsed: parseMethod(text, version) }
  })
}

// ── Client forms ────────────────────────────────────────────────────────────

const FORM_KINDS = ['proposal_form', 'template', 'brochure', 'product_summary', 'claim_form', 'letter']
const FORM_FLOWS = ['contract', 'products', 'event', 'sme', 'lawyers', 'technology']

export async function clientForms() {
  return staffAction('client forms', async () => rows('Client forms',
    db().from('client_forms').select('*').order('line').order('active', { ascending: false }).order('sent_count', { ascending: false }).limit(1000)))
}

/** Attachments TRS has sent whose file name contains the text: where a form can be taken from. */
export async function searchSentAttachments(search: string) {
  return staffAction('search sent forms', async () => {
    const q = search.trim()
    if (q.length < 3) return []
    const atts = await rows<{ id: string; message_id: string; filename: string; mime_type: string | null; storage_url: string | null; created_at: string | null }>('Attachments',
      db().from('email_attachments').select('id, message_id, filename, mime_type, storage_url, created_at')
        .ilike('filename', `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%`).order('created_at', { ascending: false }).limit(60))
    const msgs = atts.length ? await rows<{ id: string; from_address: string | null; subject: string | null; sent_at: string | null }>('Messages',
      db().from('email_messages').select('id, from_address, subject, sent_at').in('id', atts.map(a => a.message_id))) : []
    const by = new Map(msgs.map(m => [m.id, m]))
    return atts.filter(a => /trade-risksol\.com/i.test(by.get(a.message_id)?.from_address ?? '')).slice(0, 20)
      .map(a => ({ id: a.id, filename: a.filename, sent_at: by.get(a.message_id)?.sent_at ?? a.created_at, subject: by.get(a.message_id)?.subject ?? null, stored: !!a.storage_url }))
  })
}

export async function addClientForm(b: { line?: string; kind?: string; title?: string; flow?: string | null; attachment_id?: string }) {
  return staffAction('add client form', async user => {
    await requireAdmin(user.id, 'Only an administrator can add client forms.')
    const line = String(b.line ?? ''), kind = String(b.kind ?? 'proposal_form'), title = String(b.title ?? '').trim(), flow = b.flow ? String(b.flow) : null
    if (!isValidProductLine(line)) throw new Error('Choose a product line')
    if (!FORM_KINDS.includes(kind)) throw new Error('Unknown kind')
    if (flow && !FORM_FLOWS.includes(flow)) throw new Error('Unknown flow')
    const a = await one<{ id: string; filename: string; mime_type: string | null; storage_url: string | null }>('Attachment',
      db().from('email_attachments').select('id, filename, mime_type, storage_url').eq('id', String(b.attachment_id ?? '')).maybeSingle())
    if (!a) throw new Error('Attachment not found')
    const form = await one('Add client form', db().from('client_forms').insert({
      line, flow, kind, title: title || a.filename, filename: a.filename, mime_type: a.mime_type, file_ref: a.storage_url || `gmail:${a.id}`,
      attach_on: kind === 'brochure' || kind === 'claim_form' || kind === 'letter' ? ['new_request'] : ['new_request', 'renewal'], created_by: user.email,
    }).select('*').single())
    clearFormsCache()
    return form
  })
}

export async function updateClientForm(b: { id?: string; active?: boolean; line?: string; flow?: string | null; kind?: string; title?: string }) {
  return staffAction('update client form', async user => {
    await requireAdmin(user.id, 'Only an administrator can change client forms.')
    const set: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof b.active === 'boolean') set.active = b.active
    if (typeof b.line === 'string') { if (!isValidProductLine(b.line)) throw new Error('Choose a product line'); set.line = b.line }
    if (b.flow === null || typeof b.flow === 'string') { if (b.flow && !FORM_FLOWS.includes(b.flow)) throw new Error('Unknown flow'); set.flow = b.flow || null }
    if (typeof b.kind === 'string') { if (!FORM_KINDS.includes(b.kind)) throw new Error('Unknown kind'); set.kind = b.kind }
    if (typeof b.title === 'string' && b.title.trim()) set.title = b.title.trim()
    const { error } = await db().from('client_forms').update(set as never).eq('id', String(b.id ?? ''))
    if (error) throw new Error(error.message)
    clearFormsCache()
    return { ok: true as const }
  })
}

// ── Email signatures ────────────────────────────────────────────────────────

const MAX_SHARED_ALIASES = 10
const SIGNATURE_COLS = 'id, name, title, phone, email, company_tagline, is_active, sending_email, owner_user_id'
const SIGNATURE_FIELDS = new Set(['name', 'title', 'phone', 'email', 'company_tagline', 'is_active', 'sending_email'])
type SignatureRow = { id: string; name: string; title: string | null; phone: string | null; email: string | null; company_tagline: string | null; is_active: boolean | null; sending_email: string | null; owner_user_id: string | null }
export type Signature = Omit<SignatureRow, 'is_active'> & { is_active: boolean }
const signature = (r: SignatureRow): Signature => ({ ...r, is_active: r.is_active !== false })

const duplicate = (m: string) => /user_signatures_sending_email_uq|duplicate|23505/.test(m)

/** An administrator sees every signature; anyone else the shared ones and their own. */
export async function listSignatures() {
  return staffAction('signatures', async user => {
    let q = db().from('user_signatures').select(SIGNATURE_COLS).is('deleted_at', null)
    if (!(await isAdmin(user.id))) q = q.or(`owner_user_id.is.null,owner_user_id.eq.${user.id}`)
    return (await rows<SignatureRow>('Signatures', q.order('created_at'))).map(signature)
  })
}

/** A signature for your own Gmail address, or (administrators, up to 10) a shared sending address. */
export async function createSignature(b: { name?: string; title?: string | null; phone?: string | null; email?: string | null; company_tagline?: string | null; sending_email?: string }) {
  return staffAction('create signature', async user => {
    if (!b.name?.trim()) throw new Error('name required')
    if (!b.sending_email?.trim()) throw new Error('sending_email required')
    const sending = b.sending_email.trim().toLowerCase()
    const profile = await one<{ gmail_email: string | null }>('Profile', db().from('employee_profiles').select('gmail_email').eq('user_id', user.id).maybeSingle())
    const personal = profile?.gmail_email?.toLowerCase() === sending
    if (!personal) {
      await requireAdmin(user.id, 'Admin access required for shared alias signatures')
      const shared = await rows<{ id: string }>('Shared signatures', db().from('user_signatures').select('id').is('deleted_at', null).is('owner_user_id', null))
      if (shared.length >= MAX_SHARED_ALIASES) throw new Error(`Maximum of ${MAX_SHARED_ALIASES} shared signatures reached`)
    }
    const { data, error } = await db().from('user_signatures').insert({
      name: b.name.trim(), title: b.title?.trim() || null, phone: b.phone?.trim() || null, email: b.email?.trim() || null,
      company_tagline: b.company_tagline?.trim() || null, sending_email: sending, owner_user_id: personal ? user.id : null, is_active: true,
    }).select(SIGNATURE_COLS).single()
    if (error) throw new Error(duplicate(`${error.code} ${error.message}`) ? 'A signature for this address already exists' : 'Failed to create signature')
    return signature(data as SignatureRow)
  })
}

async function editableSignature(id: string, userId: string) {
  const sig = await one<{ id: string; owner_user_id: string | null }>('Signature', db().from('user_signatures').select('id, owner_user_id').eq('id', id).is('deleted_at', null).maybeSingle())
  return !!sig && (sig.owner_user_id === userId || await isAdmin(userId))
}

export async function updateSignature(id: string, body: Record<string, unknown>) {
  return staffAction('update signature', async user => {
    if (!(await editableSignature(id, user.id))) throw new Error('Not authorised to edit this signature')
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => SIGNATURE_FIELDS.has(k)))
    if (Object.keys(patch).length === 0) throw new Error('No valid fields')
    const { data, error } = await db().from('user_signatures').update(patch as never).eq('id', id).select(SIGNATURE_COLS).single()
    if (error) throw new Error(duplicate(`${error.code} ${error.message}`) ? 'A signature for this address already exists' : 'Update failed')
    return signature(data as SignatureRow)
  })
}

export async function deleteSignature(id: string) {
  return staffAction('delete signature', async user => {
    if (!(await editableSignature(id, user.id))) throw new Error('Not authorised to delete this signature')
    const { error } = await db().from('user_signatures').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    return { ok: true as const }
  })
}

// ── The team ────────────────────────────────────────────────────────────────

export type TeamUser = { id: string; email: string; name: string; role: 'administrator' | 'staff'; active: boolean; joinedAt: string | null; isSelf: boolean }

async function roster(selfId: string): Promise<TeamUser[]> {
  const [users, profiles] = await Promise.all([
    rows<{ id: string; email: string; name: string | null; active: boolean | null; created_at: string | null }>('Team', db().from('app_users').select('id, email, name, active, created_at').order('email')),
    rows<{ user_id: string; is_admin: boolean | null }>('Profiles', db().from('employee_profiles').select('user_id, is_admin')),
  ])
  const admins = new Set(profiles.filter(p => p.is_admin).map(p => p.user_id))
  return users.map(u => ({
    id: u.id, email: u.email, name: (u.name ?? '').trim() || u.email.split('@')[0],
    role: admins.has(u.id) ? 'administrator' as const : 'staff' as const,
    active: u.active !== false, joinedAt: u.created_at, isSelf: u.id === selfId,
  }))
}

export async function team() {
  return staffAction('team', async user => ({ users: await roster(user.id), me: { id: user.id, isAdmin: await isAdmin(user.id) } }))
}

export async function addTeamMember(email: string, name?: string) {
  return staffAction('add team member', async user => {
    await requireAdmin(user.id, 'Only an administrator can add people.')
    const addr = (email ?? '').trim().toLowerCase()
    if (!addr.endsWith(`@${ALLOWED_DOMAIN}`)) throw new Error(`Use a @${ALLOWED_DOMAIN} address — sign-in is restricted to that domain.`)
    // app_users.id has no default in the database; the route that did this inserted without one and failed.
    const existing = await one<{ id: string }>('Team member', db().from('app_users').select('id').eq('email', addr).maybeSingle())
    if (existing) throw new Error('That person is already on the roster.')
    const added = await one<{ id: string; email: string }>('Add team member', db().from('app_users').insert({ id: crypto.randomUUID(), email: addr, name: (name ?? '').trim() || null, active: true }).select('id, email').single())
    void logActivity({ action: 'user.added', resource_type: 'user', resource_id: added?.id, new_value: { email: addr } })
    return added
  })
}

/** Makes a person an administrator or staff, or suspends and reactivates them. Not yourself. */
export async function changeAccess(b: { userId?: string; role?: 'administrator' | 'staff'; active?: boolean }) {
  return staffAction('change access', async user => {
    await requireAdmin(user.id, 'Only an administrator can change access.')
    if (!b.userId) throw new Error('userId required')
    if (b.userId === user.id) throw new Error('You cannot change your own access. Ask another administrator.')
    if (b.role) {
      const { error } = await db().from('employee_profiles').upsert({ user_id: b.userId, is_admin: b.role === 'administrator' }, { onConflict: 'user_id' })
      if (error) throw new Error(error.message)
      void logActivity({ action: 'user.role', resource_type: 'user', resource_id: b.userId, new_value: { role: b.role } })
    }
    if (b.active !== undefined) {
      const { error } = await db().from('app_users').update({ active: b.active }).eq('id', b.userId)
      if (error) throw new Error(error.message)
      void logActivity({ action: b.active ? 'user.reactivated' : 'user.suspended', resource_type: 'user', resource_id: b.userId })
    }
    return { users: await roster(user.id) }
  })
}

// ── The signed-in person ────────────────────────────────────────────────────

export async function myProfile() {
  return staffAction('profile', async user => {
    const p = await one<{ is_admin: boolean | null; gmail_email: string | null }>('Profile', db().from('employee_profiles').select('is_admin, gmail_email').eq('user_id', user.id).maybeSingle())
    return { id: user.id, email: user.email, is_admin: p?.is_admin ?? false, gmail_email: p?.gmail_email ?? null }
  })
}

/** Forgets the person's Gmail link (their profile row; the administrator flag goes with it, as before). */
export async function disconnectGmail() {
  return staffAction('disconnect gmail', async user => {
    const { error } = await db().from('employee_profiles').delete().eq('user_id', user.id)
    if (error) throw new Error('Failed to disconnect')
    return { ok: true as const }
  })
}
