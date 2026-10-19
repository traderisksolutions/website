import { describe, it, expect } from 'vitest'
import { autoName, isMigrationPending, normaliseUrl } from '@/lib/marketing/competitors'
import { cleanCadencePatch } from '@/lib/marketing/schedule'

describe('normaliseUrl', () => {
  it('accepts a bare domain, www, paths and a full URL', () => {
    const want = { url: 'https://provide.sg', domain: 'provide.sg' }
    expect(normaliseUrl('provide.sg')).toEqual(want)
    expect(normaliseUrl('www.provide.sg/blog')).toEqual(want)
    expect(normaliseUrl('https://provide.sg/')).toEqual(want)
    expect(normaliseUrl('  HTTP://WWW.Provide.SG/blog?x=1#top ')).toEqual(want)
    expect(normaliseUrl('singlife.com.sg/business/articles')).toEqual({ url: 'https://singlife.com.sg', domain: 'singlife.com.sg' })
  })
  it('rejects empty, non-web and non-domain input', () => {
    expect(normaliseUrl('')).toEqual({ error: 'Paste the company website' })
    expect(normaliseUrl(undefined)).toEqual({ error: 'Paste the company website' })
    expect(normaliseUrl('mailto:a@b.sg')).toEqual({ error: 'The address must start with https://' })
    expect(normaliseUrl('localhost')).toEqual({ error: 'Not a domain' })
    expect(normaliseUrl('not a url')).toEqual({ error: 'Not a web address' })
  })
  it('names the company from the domain until the sweep reads the title', () => {
    expect(autoName('provide.sg')).toBe('Provide')
    expect(autoName('hugoinsurance.com')).toBe('Hugoinsurance')
    expect(autoName('singlife.com.sg')).toBe('Singlife')
    expect(autoName('blog.anapi.co')).toBe('Anapi')
  })
})

describe('lag rule and cadence', () => {
  it('recognises a missing table or column', () => {
    expect(isMigrationPending(new Error('geo_prompts GET failed (404): {"code":"PGRST205","message":"Could not find the table"}'))).toBe(true)
    expect(isMigrationPending(new Error('marketing_sites GET failed (400): column marketing_sites.nightly_time does not exist'))).toBe(true)
    expect(isMigrationPending(new Error('geo_prompts POST failed (409): duplicate key value violates unique constraint'))).toBe(false)
  })
  it('cleans a cadence patch', () => {
    expect(cleanCadencePatch({ count: 13 })).toEqual({ error: 'Articles per night must be 0 to 12' })
    expect(cleanCadencePatch({ length: 'huge' })).toEqual({ error: 'Length must be standard or long' })
    expect(cleanCadencePatch({ post: 'yes' })).toEqual({ error: 'post must be true or false' })
    expect(cleanCadencePatch({ count: '2', length: 'long', post: false })).toEqual({ patch: { nightly_count: 2, article_length: 'long', require_approval: true } })
    expect(cleanCadencePatch({})).toEqual({ patch: {} })
  })
})
