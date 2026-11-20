import { describe, it, expect, vi } from 'vitest'
import { contactIdFor } from '@/lib/crm/contact-for-email'

const io = (found: string | null, made: string | null = 'new-1') => ({ find: vi.fn().mockResolvedValue(found), insert: vi.fn().mockResolvedValue(made) })

describe('contactIdFor (lookup first, insert only when none)', () => {
  it('returns the existing contact, matched lowercased, and inserts nothing', async () => {
    const x = io('c-1')
    expect(await contactIdFor('  Hasya@Client.COM ', { name: 'Hasya M' }, x)).toBe('c-1')
    expect(x.find).toHaveBeenCalledWith('hasya@client.com')
    expect(x.insert).not.toHaveBeenCalled()
  })

  it('inserts a new address with its name, company and source', async () => {
    const x = io(null)
    expect(await contactIdFor('new@client.com', { name: 'Lisa Mae Daly', company: 'Celavi', source: 'nexus' }, x)).toBe('new-1')
    expect(x.insert).toHaveBeenCalledWith({ email: 'new@client.com', source: 'nexus', first_name: 'Lisa', last_name: 'Mae Daly', company: 'Celavi' })
  })

  it('a one-word name fills both name columns; no name leaves them out', async () => {
    const a = io(null); await contactIdFor('a@b.com', { name: 'Cher' }, a)
    expect(a.insert).toHaveBeenCalledWith({ email: 'a@b.com', source: 'email', first_name: 'Cher', last_name: 'Cher' })
    const b = io(null); await contactIdFor('a@b.com', {}, b)
    expect(b.insert).toHaveBeenCalledWith({ email: 'a@b.com', source: 'email' })
  })

  it('a failed insert looks again (another request made it), and a non-address is refused', async () => {
    const x = { find: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('raced'), insert: vi.fn().mockResolvedValue(null) }
    expect(await contactIdFor('a@b.com', {}, x)).toBe('raced')
    const y = io('c-1')
    expect(await contactIdFor('not an email', {}, y)).toBeNull()
    expect(y.find).not.toHaveBeenCalled()
  })
})
