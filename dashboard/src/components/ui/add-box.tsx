'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/** The Add box: a grey field, a green plus, the file types, drag and drop or click. */
export function AddBox({ id, label, types, accept, multiple, disabled, onFiles }: {
  id: string; label: string; types: string; accept: string; multiple?: boolean; disabled?: boolean; onFiles: (files: File[]) => void
}) {
  const [over, setOver] = useState(false)
  return (
    <label htmlFor={id}
      className={cn('flex cursor-pointer flex-col items-center gap-1 rounded bg-trs-field px-3 py-5 text-center transition-shadow', over && 'ring-2 ring-trs-green', disabled && 'cursor-not-allowed opacity-60')}
      onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (disabled) return; const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}>
      <span aria-hidden className="mb-1 grid h-8 w-8 place-items-center rounded-full bg-trs-green text-heading leading-none text-white">+</span>
      <span className="text-body font-medium text-trs-ink">{label}</span>
      <span className="text-small text-trs-muted">{types}</span>
      <span className="text-small text-trs-muted">Drag and drop, or click</span>
      <input id={id} type="file" accept={accept} multiple={multiple} disabled={disabled} className="sr-only"
        onChange={e => { const fs = [...(e.target.files ?? [])]; if (fs.length) onFiles(fs); e.target.value = '' }} />
    </label>
  )
}
