'use client'

/** The File button: opens File to Drive for one attachment or one data-room document. */
import { useState } from 'react'
import { FolderInput } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'
import { FileDialog, type FileRef } from './FileDialog'

export function FileButton({ onFiled, label = 'File', ...ref }: FileRef & { onFiled?: (doc: { id: string; status: string; drive_url: string | null }) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Btn size="xs" level="tertiary" onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={`${label} to Drive`}>
        <FolderInput size={14} aria-hidden /> {label}
      </Btn>
      {open && <FileDialog {...ref} open={open} onClose={() => setOpen(false)} onFiled={onFiled} />}
    </>
  )
}
