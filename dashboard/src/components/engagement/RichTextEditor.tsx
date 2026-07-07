'use client'

import React, { useRef, useEffect } from 'react'
import { Bold, Italic, List, ListOrdered, IndentIncrease, IndentDecrease, Link2, Heading } from 'lucide-react'

/**
 * Lightweight rich-text editor for RFQ drafts. Uncontrolled contentEditable so
 * the caret is never reset on re-render; `resetKey` re-seeds the content (used
 * when a draft is regenerated). Emits HTML via onChange. Toolbar: bold, italic,
 * heading, bullet / numbered lists, indent / outdent, link.
 */
export function RichTextEditor({
  html, resetKey, onChange, minHeight = 180,
}: {
  html: string
  resetKey?: string | number
  onChange: (html: string) => void
  minHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Seed content on mount and whenever the draft is regenerated (resetKey change).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  function exec(cmd: string, val?: string) {
    document.execCommand(cmd, false, val)
    ref.current?.focus()
    if (ref.current) onChange(ref.current.innerHTML)
  }
  function addLink() {
    const url = window.prompt('Link URL (https://…)')
    if (url) exec('createLink', url)
  }

  const Btn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={e => e.preventDefault()}  // keep the selection
      onClick={onClick}
      className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {children}
    </button>
  )

  return (
    <div className="border border-[--border-subtle] rounded-md bg-background overflow-hidden">
      <div className="flex items-center gap-0.5 border-b border-[--border-subtle] px-1 py-1 bg-muted/30">
        <Btn onClick={() => exec('bold')} title="Bold"><Bold size={13} /></Btn>
        <Btn onClick={() => exec('italic')} title="Italic"><Italic size={13} /></Btn>
        <Btn onClick={() => exec('formatBlock', '<h3>')} title="Heading"><Heading size={13} /></Btn>
        <span className="w-px h-4 bg-border mx-0.5" />
        <Btn onClick={() => exec('insertUnorderedList')} title="Bullet list"><List size={13} /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={13} /></Btn>
        <Btn onClick={() => exec('outdent')} title="Outdent"><IndentDecrease size={13} /></Btn>
        <Btn onClick={() => exec('indent')} title="Indent"><IndentIncrease size={13} /></Btn>
        <span className="w-px h-4 bg-border mx-0.5" />
        <Btn onClick={addLink} title="Insert link"><Link2 size={13} /></Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML) }}
        className="rte-content px-3 py-2 text-[12px] leading-relaxed outline-none overflow-y-auto"
        style={{ minHeight, maxHeight: 340 }}
      />
    </div>
  )
}
