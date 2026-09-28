'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import type { BoardPayload } from '@/lib/crm/board'

/** On a company page: how many open to-dos it carries, linking to its row on the board. */
export function BoardChip({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [overdue, setOverdue] = useState(0)
  useEffect(() => {
    fetch('/api/board', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then((d: BoardPayload | null) => {
      const c = d?.companies.find(x => x.id === companyId)
      const items = c?.tasks.filter(t => t.status !== 'complete') ?? []
      setOpen(items.length)
      setOverdue(items.filter(t => t.due_on && t.due_on < (d?.today ?? '')).length)
    }).catch(() => setOpen(0))
  }, [companyId])
  if (open === null) return null
  return (
    <Link href={`/?company=${companyId}`} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold border border-input bg-transparent text-foreground no-underline hover:bg-muted" title="Pressing items on the board">
      <ListChecks size={12} /> {open === 0 ? 'Add to-do' : `${open} to-do${open === 1 ? '' : 's'}`}
      {overdue > 0 && <span style={{ color: '#5f6368' }}>· {overdue} past due date</span>}
    </Link>
  )
}
