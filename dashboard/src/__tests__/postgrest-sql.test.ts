import { describe, it, expect } from 'vitest'
import { selectToSql, countToSql, UnsupportedQuery } from '@/lib/postgrest-sql'

describe('selectToSql', () => {
  it('translates a bare select', () => {
    expect(selectToSql('companies', 'select=*')).toEqual({ text: 'select * from public."companies"', values: [] })
  })

  it('quotes columns and honours aliases', () => {
    const r = selectToSql('companies', 'select=id,name:company_name')
    expect(r.text).toBe('select "id", "company_name" as "name" from public."companies"')
  })

  it('parameterises equality rather than interpolating', () => {
    const r = selectToSql('debit_notes', 'select=*&status=eq.unpaid')
    expect(r.text).toBe('select * from public."debit_notes" where "status" = $1')
    expect(r.values).toEqual(['unpaid'])
  })

  it('handles in. lists', () => {
    const r = selectToSql('debit_notes', 'select=*&status=in.(unpaid,partially_paid)')
    expect(r.text).toBe('select * from public."debit_notes" where "status" in ($1, $2)')
    expect(r.values).toEqual(['unpaid', 'partially_paid'])
  })

  it('handles is.null and negation', () => {
    expect(selectToSql('t', 'deleted_at=is.null').text).toBe('select * from public."t" where "deleted_at" is null')
    expect(selectToSql('t', 'company_id=not.is.null').text).toBe('select * from public."t" where not ("company_id" is null)')
  })

  it('handles comparison operators', () => {
    const r = selectToSql('policies', 'end_date=gte.2026-01-01&end_date=lte.2026-12-31')
    expect(r.values).toEqual(['2026-01-01', '2026-12-31'])
    expect(r.text).toContain('>= $1')
  })

  it('applies order, limit and offset', () => {
    const r = selectToSql('t', 'select=*&order=created_at.desc.nullslast&limit=50&offset=100')
    expect(r.text).toBe('select * from public."t" order by "created_at" desc nulls last limit 50 offset 100')
  })

  it('rejects embedded resources loudly instead of returning wrong rows', () => {
    expect(() => selectToSql('cases', 'select=id,companies(id,name)')).toThrow(UnsupportedQuery)
  })

  it('rejects an injected identifier', () => {
    expect(() => selectToSql('t', 'select=id;drop table users')).toThrow(UnsupportedQuery)
    expect(() => selectToSql('t; drop table x', 'select=*')).toThrow(UnsupportedQuery)
  })

  it('an empty in. list matches nothing rather than everything', () => {
    expect(selectToSql('t', 'id=in.()').text).toBe('select * from public."t" where false')
  })
})

describe('countToSql', () => {
  it('counts with the same filters and drops paging', () => {
    const r = countToSql('debit_notes', 'select=*&status=eq.unpaid&limit=10&order=id')
    expect(r.text).toBe('select count(*)::int as count from public."debit_notes" where "status" = $1')
    expect(r.values).toEqual(['unpaid'])
  })
})
