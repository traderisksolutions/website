import { describe, expect, it } from 'vitest'
import { personName, plain, pointLine, stepTitle } from '@/lib/today/read-words'

describe('stepTitle', () => {
  it('writes each kind of step the same way', () => {
    expect(stepTitle({ verb: 'send', who: 'Sean Foo', what: 'the revised ECICS cover note', ask: 'the signed LOA' })).toBe('Send Sean Foo the revised ECICS cover note and ask for the signed LOA')
    expect(stepTitle({ verb: 'quote', insurer: 'ECICS', project: 'Dover Drive show flat', line: 'CAR' })).toBe('Request a quotation from ECICS for Dover Drive show flat (CAR)')
    expect(stepTitle({ verb: 'chase', who: 'Jiaqing Wang', what: 'Terms for the annual travel quote' })).toBe('Chase Jiaqing Wang for terms for the annual travel quote')
    expect(stepTitle({ verb: 'discard', who: 'Lai Bao Ling' })).toBe('Discard the draft to Lai Bao Ling')
    expect(stepTitle({ verb: 'task', what: 'file the policy on the register' })).toBe('File the policy on the register')
  })
  it('names people, never addresses', () => {
    expect(stepTitle({ verb: 'update', who: 'sean.foo@ccccltd.sg', what: 'Attach the revised cover note' })).toBe('Update the draft to Sean Foo: attach the revised cover note')
    expect(personName('nur_amirah@ecics.com.sg')).toBe('Nur Amirah')
  })
  it('falls back to the model title, made plain, when parts are missing', () => {
    expect(stepTitle({ verb: 'send', title: 'Kindly ensure the pending email to Sean is sent.' })).toBe('Make sure the draft to Sean is sent')
  })
})

describe('plain and pointLine', () => {
  it('drops padding and form-letter words', () => {
    expect(plain('Please be advised that the premium regarding GHS is outstanding.')).toBe('the premium about GHS is still due')
  })
  it('writes a point with its side, person and date', () => {
    expect(pointLine({ side: 'client', who: 'Sean Foo', text: 'Accepted ECICS at S$1,868.75 before GST', date: '12 Nov' })).toBe('Client · Sean Foo: accepted ECICS at S$1,868.75 before GST · 12 Nov')
    expect(pointLine({ side: 'insurer', who: 'ECICS', text: '' })).toBe('')
  })
})
