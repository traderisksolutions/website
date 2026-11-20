/**
 * A company's data room from its policies and documents: each open policy with its documents and
 * what it still needs, the appointment letters, and the documents not yet sorted to a policy.
 * Pure; the data-room route and the company page share it.
 */
import type * as store from './store'
import { dataRoomStatus } from './taxonomy'

type RoomPolicy = Awaited<ReturnType<typeof store.companyPolicies>>[number]

export function dataRooms(policies: RoomPolicy[], docs: store.PolicyDocument[]) {
  const byPolicy = new Map<string, store.PolicyDocument[]>()
  for (const d of docs) if (d.policy_id) byPolicy.set(d.policy_id, [...(byPolicy.get(d.policy_id) ?? []), d])
  const rooms = policies
    .filter(p => p.lifecycle !== 'closed' && p.lifecycle !== 'declined')
    .map(p => {
      const held = byPolicy.get(p.id) ?? []
      return {
        policy: { id: p.id, label: p.label ?? p.class_of_insurance, insurer: p.insurer, policy_number: p.policy_number ?? p.cover_note_no, lifecycle: p.lifecycle, start_date: p.start_date, end_date: p.end_date, drive_folder_url: p.drive_folder_url, is_eb: p.is_eb },
        status: dataRoomStatus({ lifecycle: p.lifecycle, is_eb: p.is_eb, product_line: p.product_line }, held.map(d => d.doc_type)),
        documents: held,
      }
    })
  const letters = docs.filter(d => !d.policy_id && d.doc_type === 'broker_appointment')
  const unsorted = docs.filter(d => !d.policy_id && d.doc_type !== 'broker_appointment')
  return { rooms, unsorted, letters, total: docs.length }
}
