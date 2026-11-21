'use client'

/**
 * The four texts kept in their own stores, shown in AI Agents › Knowledge (moved from Settings ›
 * Agents, Jarod 21 Nov 2026): the same panels and actions (src/app/settings/actions.ts).
 */
import { useEffect, useState } from 'react'
import { VoicePanel } from '@/components/settings/VoicePanel'
import { RenewalMethodPanel } from '@/components/settings/RenewalMethodPanel'
import { ClientFormsPanel } from '@/components/settings/ClientFormsPanel'
import { ChecklistPanel } from '@/components/settings/ChecklistPanel'
import { myProfile } from '@/app/settings/actions'

export function KnowledgePanel({ panel }: { panel: 'tone' | 'renewal' | 'forms' | 'checklists' }) {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => { void myProfile().then(r => { if (r.ok) setIsAdmin(!!r.data?.is_admin) }) }, [])
  if (panel === 'tone') return <VoicePanel isAdmin={isAdmin} />
  if (panel === 'renewal') return <RenewalMethodPanel isAdmin={isAdmin} />
  if (panel === 'forms') return <ClientFormsPanel isAdmin={isAdmin} />
  return <ChecklistPanel />
}
