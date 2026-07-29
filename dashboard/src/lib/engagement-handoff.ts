import type { NewEmailDraft } from '@/components/engagement/NewEmailComposeModal'

/**
 * Client-side handoff to the Engagement Agent's standalone composer — the same
 * sessionStorage('trs_pending_new') → /engagement?compose=new mechanism Nexus already uses for
 * a "no thread yet" draft_email action (src/providers/chat-dock-provider.tsx). Debit Note and
 * Calendar's "Send via Engagement" actions reuse it so a generated PDF lands pre-attached and
 * pre-addressed.
 */
export function openEngagementCompose(draft: NewEmailDraft): void {
  window.sessionStorage.setItem('trs_pending_new', JSON.stringify(draft))
  window.location.href = '/engagement?compose=new'
}
