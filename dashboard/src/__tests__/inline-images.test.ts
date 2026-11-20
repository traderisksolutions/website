import { describe, it, expect } from 'vitest'
import { findDataUris, planInline, replaceDataUris, planBatch, batchPath, sniffImage, emailImageUrl, verifyEmailImageSig, INLINE_MIN_CHARS } from '@/lib/mail/inline-images'

// Real magic bytes padded to a size the planner moves.
const png = (n = 2_000, seed = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, seed)])
const jpeg = (n = 2_000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 7)])
const uri = (b: Buffer, type = 'image/png') => `data:${type};base64,${b.toString('base64')}`

describe('findDataUris', () => {
  it('finds every image once, in src and in CSS url()', () => {
    const a = uri(png()), b = uri(jpeg(), 'image/jpeg')
    const html = `<img src="${a}"><p style="background:url(${b})">x</p><img src='${a}'>`
    const found = findDataUris(html)
    expect(found.map(f => f.raw)).toEqual([a, b])
    expect(found[1].declared).toBe('image/jpeg')
  })

  it('reads odd encodings: upper case, extra parameters, wrapped lines, entities, URL-safe alphabet', () => {
    const b64 = png().toString('base64')
    const wrapped = b64.match(/.{1,76}/g)!.join('\r\n  ')
    const cases = [
      `<img src="DATA:IMAGE/PNG;BASE64,${b64}">`,
      `<img src="data:image/png;name=logo.png;charset=binary;base64,${b64}">`,
      `<img src="data:image/png;base64,${wrapped}">`,
      `<img src="data:image/png;base64,${b64.slice(0, 100)}&#10;${b64.slice(100)}">`,
      `<img src="data:image/png;base64,${b64.replace(/\+/g, '-').replace(/\//g, '_')}">`,
    ]
    for (const html of cases) {
      const [f] = findDataUris(html)
      expect(Buffer.from(f.base64, 'base64').equals(png())).toBe(true)
      expect(html.includes(f.raw)).toBe(true)
    }
  })

  it('stops an unquoted attribute at the space before the next attribute', () => {
    const a = uri(png())
    const [f] = findDataUris(`<img src=${a} alt=logo>`)
    expect(f.raw).toBe(a)
  })

  it('ignores text that is not a data:image URI', () => {
    expect(findDataUris('data:text/plain;base64,QUJD and data:image/png;utf8,abc')).toEqual([])
  })
})

describe('planInline', () => {
  it('moves raster images by their real type and keeps the rest with a reason', () => {
    const mislabelled = uri(png(), 'image/jpeg')
    const tiny = uri(png(10))
    const svg = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${'x'.repeat(2_000)}</svg>`).toString('base64')}`
    const junk = `data:image/png;base64,${Buffer.alloc(2_000, 1).toString('base64')}`
    const p = planInline(`<img src="${mislabelled}"><img src="${tiny}"><img src="${svg}"><img src="${junk}">`)
    expect(p.move.map(m => m.mime)).toEqual(['image/png'])
    expect(p.move[0].ext).toBe('png')
    expect(p.move[0].hash).toMatch(/^[0-9a-f]{32}$/)
    expect(p.keep.map(k => k.reason)).toEqual(['small', 'not_raster', 'unreadable'])
    expect(p.movedChars).toBe(mislabelled.length)
    expect(tiny.length).toBeLessThan(INLINE_MIN_CHARS)
  })

  it('keeps an image over the size limit', () => {
    const p = planInline(`<img src="${uri(png(5_000))}">`, { maxBytes: 4_000 })
    expect(p.move).toEqual([])
    expect(p.keep[0].reason).toBe('too_large')
  })

  it('gives the same image the same hash', () => {
    const p = planInline(`<img src="${uri(png())}"><img src="${uri(png(), 'image/jpeg')}">`)
    expect(p.move).toHaveLength(2)
    expect(p.move[0].hash).toBe(p.move[1].hash)
  })
})

describe('replaceDataUris', () => {
  it('replaces every occurrence of each image and leaves the rest of the HTML as it was', () => {
    const a = uri(png(2_000, 1)), b = uri(png(2_000, 2))
    const html = `<p>Hi</p><img src="${a}"><img src="${b}"><blockquote><img src="${a}"></blockquote>`
    const out = replaceDataUris(html, new Map([[a, 'https://x/1?s=a'], [b, 'https://x/2?s=b']]))
    expect(out).toBe('<p>Hi</p><img src="https://x/1?s=a"><img src="https://x/2?s=b"><blockquote><img src="https://x/1?s=a"></blockquote>')
    expect(out).not.toContain('data:image')
  })

  it('replaces the longer of two URIs that share a prefix whole', () => {
    const short = uri(png(2_000)), long = short + 'AAAA'
    const out = replaceDataUris(`<img src="${long}"><img src="${short}">`, new Map([[short, 'S'], [long, 'L']]))
    expect(out).toBe('<img src="L"><img src="S">')
  })
})

describe('signed link', () => {
  const key = 'k'.repeat(32)
  it('verifies its own signature and refuses another id, key or a missing one', () => {
    const url = emailImageUrl('1AbCdEfGhIjKlMnOp', 'https://dash.example', key)
    expect(url).toMatch(/^https:\/\/dash\.example\/api\/public\/email-image\/1AbCdEfGhIjKlMnOp\?s=[\w-]{43}$/)
    const s = new URL(url).searchParams.get('s')
    expect(verifyEmailImageSig('1AbCdEfGhIjKlMnOp', s, key)).toBe(true)
    expect(verifyEmailImageSig('1AbCdEfGhIjKlMnOq', s, key)).toBe(false)
    expect(verifyEmailImageSig('1AbCdEfGhIjKlMnOp', s, 'x'.repeat(32))).toBe(false)
    expect(verifyEmailImageSig('1AbCdEfGhIjKlMnOp', null, key)).toBe(false)
  })
})

describe('sniffImage', () => {
  it('names png, jpeg, gif, webp and nothing else', () => {
    expect(sniffImage(png())?.mime).toBe('image/png')
    expect(sniffImage(jpeg())?.mime).toBe('image/jpeg')
    expect(sniffImage(Buffer.from('GIF89a......'))?.mime).toBe('image/gif')
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))?.mime).toBe('image/webp')
    expect(sniffImage(Buffer.from('<svg></svg>'))).toBeNull()
  })
})

describe('dry-run planner', () => {
  it('sums one batch and hands on the last id as the cursor', () => {
    const a = uri(png(2_000, 1)), b = uri(jpeg(), 'image/jpeg')
    const p = planBatch([
      { id: 'a1', body_html: `<img src="${a}"><img src="${b}">` },
      { id: 'b2', body_html: `<img src="${a}">` },
      { id: 'c3', body_html: 'mentions data:image only in text' },
      { id: 'd4', body_html: null },
    ])
    expect(p).toMatchObject({ rows: 4, rowsToChange: 2, images: 3, uniqueImages: 2, movedChars: a.length * 2 + b.length, keptImages: 0, nextCursor: 'd4' })
    expect(planBatch([]).nextCursor).toBeNull()
  })

  it('reads the next 25 rows after the cursor by id (no LIKE scan)', () => {
    expect(batchPath(null)).toBe('email_messages?select=id,body_html&order=id.asc&limit=25')
    expect(batchPath('0006432e-c95c')).toBe('email_messages?select=id,body_html&id=gt.0006432e-c95c&order=id.asc&limit=25')
  })
})
