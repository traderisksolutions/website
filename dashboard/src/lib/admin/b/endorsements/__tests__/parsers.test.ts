import { describe, it, expect } from 'vitest'
import { parseMovementBody } from '../parse-body'
import { parseMovementRows, detectHeader } from '../parse-sheet'

describe('parseMovementBody', () => {
  it('reads a leavers list and a joiners list under headings', () => {
    const text = `Hi Catherine and Hasya,
May I know the status of the
So, a total 2 staff left: -
1. Tan Wei Ming - last day 23 April 26
2. Ong Siew Lan - last day - 31 May 26
Add new staff as at 01 July 26:
1. Ahmad Firdaus Bin Rahim
2. Nur Aisyah Binti Ismail
Thank You!`
    const ms = parseMovementBody(text)
    expect(ms.map(m => [m.kind, m.name, m.effective_on, m.last_day])).toEqual([
      ['leave', 'Tan Wei Ming', '2026-04-24', '2026-04-23'],
      ['leave', 'Ong Siew Lan', '2026-06-01', '2026-05-31'],
      ['join', 'Ahmad Firdaus Bin Rahim', '2026-07-01', null],
      ['join', 'Nur Aisyah Binti Ismail', '2026-07-01', null],
    ])
    expect(ms[0].quote).toContain('Tan Wei Ming')
    expect(ms.every(m => m.source === 'body' && m.movement_type === 'member')).toBe(true)
  })

  it('reads a resignation sentence, a name change and a joiner sentence', () => {
    const text = `We checked the member list and noticed that it still includes Lee Kok Wah Vincent, who has resigned from our company.
In addition, please take note that my colleague, Dewi Dewi, has legally changed her name to Dewi Anne Koh. Kindly update her name.
Tan Ah Kow joined us on 3 Feb 2026.`
    const ms = parseMovementBody(text, '2026-09-25')
    expect(ms.find(m => m.kind === 'leave')?.name).toBe('Lee Kok Wah Vincent')
    const chg = ms.find(m => m.kind === 'change')
    expect(chg?.name).toBe('Dewi Dewi')
    expect(chg?.detail.new_name).toBe('Dewi Anne Koh')
    const j = ms.find(m => m.kind === 'join')
    expect(j?.name).toBe('Tan Ah Kow')
    expect(j?.effective_on).toBe('2026-02-03')
  })

  it('does not invent movements from a signature, a thank-you or a claim question', () => {
    const text = `Thank you Catherine.
Best regards,
Ms. Anne Koh Director
Acme Wildlife Pte Ltd Rescue | Exclusion | Education
Mobile: +65 9000 0000
We would also like to check whether the GPA coverage has been included.
Clinic we visit is available in both IHP and Mednefits before we can go to the Specialist Panel.`
    expect(parseMovementBody(text)).toEqual([])
  })

  it('reads markdown-bold names, bullet headings and sentences wrapped across lines', () => {
    const text = `We checked the member list and noticed that it still includes *Lee Kok Wah
Vincent*, who has resigned from our company.
In addition, please take note that my colleague, *Dewi Dewi*, has
legally changed her name to *Dewi Anne Koh*. Kindly update her name in
the member list accordingly.
 *So, a total 2 staff left: -*
1. Tan Wei Ming - last day 23 April 26
*Add new staff as at 01 July 26: *
1. Ahmad Firdaus Bin Rahim
2. Nur Aisyah Binti Ismail`
    const ms = parseMovementBody(text)
    expect(ms.map(m => [m.kind, m.name])).toEqual([
      ['leave', 'Lee Kok Wah Vincent'],
      ['change', 'Dewi Dewi'],
      ['leave', 'Tan Wei Ming'],
      ['join', 'Ahmad Firdaus Bin Rahim'],
      ['join', 'Nur Aisyah Binti Ismail'],
    ])
    expect(ms[3].effective_on).toBe('2026-07-01')
  })

  it('reads a staff member missing from the list as an addition, and not a sentence about a date', () => {
    const ms = parseMovementBody(`We also found that one of our current staff members, *Jonathan Tan Zi Hao*, is missing from the member list.
Please note that This Retroactive Date joined the policy from 1 Jan 2026 as agreed.`)
    expect(ms.map(m => [m.kind, m.name])).toEqual([['join', 'Jonathan Tan Zi Hao']])
  })

  it('does not read a list of cover types in a quotation request as joiners', () => {
    const ms = parseMovementBody(`Lines to include:
1. Work Injury Compensation
2. Construction Plant and Machinery
3. Marine Cargo
Target Award: 29 Jan 2027
New staff to add from 1 Mar 2027:
1. Lim Ah Seng`)
    expect(ms.map(m => [m.kind, m.name])).toEqual([['join', 'Lim Ah Seng']])
  })

  it('leaves a list without a heading or a verb alone', () => {
    const text = `Please see the names:
1. Lim Ah Seng
2. Ong Bee Hwa`
    expect(parseMovementBody(text)).toEqual([])
  })

  it('reads dates written several ways and never a date it cannot read', () => {
    const text = `Leavers:
- Lee Mei Ling (last day 31/05/2026)
- Koh Wei Jie - last day 1st June 2026
- Ravi Kumar - effective 2026-07-01
- Siti Nurhaliza - last day sometime next month`
    const ms = parseMovementBody(text)
    expect(ms.map(m => [m.name, m.last_day, m.effective_on])).toEqual([
      ['Lee Mei Ling', '2026-05-31', '2026-06-01'],
      ['Koh Wei Jie', '2026-06-01', '2026-06-02'],
      ['Ravi Kumar', null, '2026-07-01'],
      ['Siti Nurhaliza', null, null],
    ])
  })
})

describe('parseMovementRows', () => {
  it('reads an action-column sheet in the QBE layout', () => {
    const rows = [
      ['Prepared by the client'],
      ['Action Code (A/D/C)', 'Policy No.', 'Name (as in NRIC/Passport)', 'Relationship (M/S/C)', 'Gender', 'Date of Birth', 'Date of Employment', 'Effective Date', 'Plan No.', 'Last Day of Service'],
      ['A', 'N0000001', 'Ahmad Firdaus Bin Rahim', 'M', 'M', new Date('1995-03-02T00:00:00Z'), '01/07/2026', '01/07/2026', '4', null],
      ['D', 'N0000001', 'Tan Wei Ming', 'M', 'M', null, null, null, '4', '23/04/2026'],
      ['C', 'N0000001', 'Dewi Dewi', 'M', 'F', null, null, '01/09/2026', '3', null],
      ['Total', null, null],
    ]
    const ms = parseMovementRows(rows, 'movement.xlsx')
    expect(ms.map(m => [m.kind, m.name, m.effective_on, m.last_day])).toEqual([
      ['join', 'Ahmad Firdaus Bin Rahim', '2026-07-01', null],
      ['leave', 'Tan Wei Ming', '2026-04-24', '2026-04-23'],
      ['change', 'Dewi Dewi', '2026-09-01', null],
    ])
    expect(ms[0].detail).toMatchObject({ dob: '1995-03-02', gender: 'M', plan: '4', employment_date: '2026-07-01' })
    expect(ms[0].source).toBe('sheet:movement.xlsx')
  })

  it('reads a joiner list with no action column by its joining date, and a leaver list by its last day', () => {
    const joiners = [['Name', 'NRIC', 'Date of Joining', 'Designation'], ['Lim Ah Seng', 'S1234567A', '2026-07-01', 'Keeper'], ['Ong Bee Hwa', 'S7654321B', '15/07/2026', 'Officer']]
    expect(parseMovementRows(joiners, 'new staff.xlsx').map(m => [m.kind, m.name, m.effective_on])).toEqual([['join', 'Lim Ah Seng', '2026-07-01'], ['join', 'Ong Bee Hwa', '2026-07-15']])
    const leavers = [['Employee Name', 'Last Day'], ['Ong Siew Lan', '31 May 2026']]
    expect(parseMovementRows(leavers, 'resigned.xlsx').map(m => [m.kind, m.name, m.last_day, m.effective_on])).toEqual([['leave', 'Ong Siew Lan', '2026-05-31', '2026-06-01']])
  })

  it('returns nothing for a plain member listing', () => {
    const listing = [['S/N', 'Name', 'NRIC', 'Date of Birth', 'Plan'], ['1', 'Lim Ah Seng', 'S1234567A', '01/01/1990', '4'], ['2', 'Ong Bee Hwa', 'S7654321B', '02/02/1991', '4']]
    expect(parseMovementRows(listing, 'members.xlsx')).toEqual([])
    expect(detectHeader(listing)?.cols.name).toBe(1)
  })

  it('reads a fleet schedule with an action column as vehicle movements', () => {
    const rows = [['Action', 'Vehicle Registration', 'Make/Model', 'Effective Date'], ['Add', 'SKB1234A', 'Toyota Hiace', '01/08/2026'], ['Delete', 'SGP5678Z', 'Nissan NV350', '31/07/2026']]
    const ms = parseMovementRows(rows, 'fleet.xlsx')
    expect(ms.map(m => [m.kind, m.movement_type, m.name, m.effective_on])).toEqual([['join', 'vehicle', 'SKB1234A', '2026-08-01'], ['leave', 'vehicle', 'SGP5678Z', '2026-07-31']])
  })

  it('reads Excel serial dates', () => {
    const rows = [['Name', 'Effective Date'], ['Lim Ah Seng', '46204']]
    expect(parseMovementRows(rows, 'x.xlsx')[0].effective_on).toBe('2026-07-01')
  })
})
