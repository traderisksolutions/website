import { describe, expect, it } from 'vitest'
import { fileHits, listable, parsePeople, peopleHits, peopleText, searchTerms, viaOf } from '@/lib/search/query'

describe('searchTerms', () => {
  it('every word is a required prefix, quoted for to_tsquery', () => {
    expect(searchTerms('Deluge travel')).toEqual({ words: ['deluge', 'travel'], tsquery: "'deluge':* & 'travel':*", trigram: 'deluge' })
  })
  it('keeps an address whole and drops operators', () => {
    const t = searchTerms("jiaqing@ccccltd.sg & ' | ! (x)")
    expect(t.words).toEqual(['jiaqing@ccccltd.sg'])
    expect(t.tsquery).toBe("'jiaqing@ccccltd.sg':*")
  })
  it('splits punctuation, drops one-letter words, at most eight words, no trigram under three letters', () => {
    expect(searchTerms('Dover-Drive a b').words).toEqual(['dover', 'drive'])
    expect(searchTerms('a b c d e f g h i j k l m n').words).toEqual([])
    expect(searchTerms('aa bb').trigram).toBeNull()
    expect(searchTerms('w1 w2 w3 w4 w5 w6 w7 w8 w9').words).toHaveLength(8)
  })
  it('empty search builds nothing', () => {
    expect(searchTerms('  ')).toEqual({ words: [], tsquery: '', trigram: null })
  })
})

describe('people text', () => {
  it('round-trips names and addresses', () => {
    const ps = [{ name: 'Jiaqing Li', email: 'jiaqing@ccccltd.sg' }, { name: null, email: 'ops@trade-risksol.com' }]
    expect(parsePeople(peopleText(ps))).toEqual(ps)
  })
})

describe('ring-fenced results', () => {
  const row = { subject: 'Deluge Annual Travel', people: 'Manfred <m@client.invalid>', attachments: 'policy.pdf' }
  it('a thread the viewer cannot open is listed only by subject, people or files', () => {
    expect(listable(row, ['deluge'], false)).toBe(true)
    expect(listable(row, ['premium'], false)).toBe(false)
    expect(listable(row, ['premium'], true)).toBe(true)
  })
  it('names where the words were found', () => {
    expect(viaOf(row, ['deluge'])).toBe('subject')
    expect(viaOf(row, ['manfred'])).toBe('people')
    expect(viaOf(row, ['policy'])).toBe('file')
    expect(viaOf(row, ['premium'])).toBe('text')
  })
})

describe('groups', () => {
  it('people: TRS left out, counted, newest first', () => {
    const p = peopleHits([
      { lastAt: '2026-11-01', people: [{ name: 'Jiaqing', email: 'jq@c.invalid' }, { name: 'Jiaqing T', email: 'jiaqing@trade-risksol.com' }] },
      { lastAt: '2026-11-05', people: [{ name: null, email: 'jq@c.invalid' }] },
    ], ['jiaq'])
    expect(p).toEqual([{ name: 'Jiaqing', email: 'jq@c.invalid', threads: 2, lastAt: '2026-11-05' }])
  })
  it('files: names holding every word, one per name, newest first', () => {
    const f = fileHits([
      { thread_id: 'a', attachments: 'Census 2026.xlsx\nlogo.png', subject: 'A', lastAt: '2026-11-01', canOpen: true, owner: null },
      { thread_id: 'b', attachments: 'census 2026.xlsx', subject: 'B', lastAt: '2026-11-02', canOpen: false, owner: 'Nathan' },
    ], ['census'])
    expect(f.map(x => [x.threadId, x.filename])).toEqual([['b', 'census 2026.xlsx']])
  })
})
