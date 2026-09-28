'use client'

import React, { useRef, useEffect } from 'react'
import { Bold, Italic, List, ListOrdered, IndentIncrease, IndentDecrease, Link2, Heading } from 'lucide-react'

/**
 * Lightweight rich-text editor for RFQ drafts. Uncontrolled contentEditable so
 * the caret is never reset on re-render; `resetKey` re-seeds the content (used
 * when a draft is regenerated). Emits HTML via onChange. Toolbar: bold, italic,
 * heading, bullet / numbered lists, indent / outdent, link — on the composer tokens
 * (32px buttons, hairline groups, ink active state).
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

  const Btn = ({ onClick, title, shortcut, children }: { onClick: () => void; title: string; shortcut?: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={shortcut ? `${title} (${shortcut})` : title}
      aria-label={title}
      onMouseDown={e => e.preventDefault()}  // keep the selection
      onClick={onClick}
      className="h-8 w-8 flex items-center justify-center rounded-[8px] bg-transparent border-0 cursor-pointer hover:bg-[#f1f3f4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#202124]/30"
      style={{ color: '#3c4043' }}
    >
      {children}
    </button>
  )
  const Sep = () => <span aria-hidden className="w-px h-5 mx-1.5" style={{ background: '#e8eaed' }} />

  return (
    <div className="rounded-[10px] bg-white overflow-hidden" style={{ border: '1px solid #dadce0' }}>
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 flex-wrap px-2 py-1.5" style={{ borderBottom: '1px solid #e8eaed' }}>
        <Btn onClick={() => exec('bold')} title="Bold" shortcut="⌘B"><Bold size={15} strokeWidth={2.5} /></Btn>
        <Btn onClick={() => exec('italic')} title="Italic" shortcut="⌘I"><Italic size={15} /></Btn>
        <Btn onClick={() => exec('formatBlock', '<h3>')} title="Heading"><Heading size={15} /></Btn>
        <Sep />
        <Btn onClick={() => exec('insertUnorderedList')} title="Bulleted list"><List size={16} /></Btn>
        <Btn onClick={() => exec('insertOrderedList')} title="Numbered list"><ListOrdered size={16} /></Btn>
        <Btn onClick={() => exec('outdent')} title="Decrease indent" shortcut="⇧Tab"><IndentDecrease size={16} /></Btn>
        <Btn onClick={() => exec('indent')} title="Increase indent" shortcut="Tab"><IndentIncrease size={16} /></Btn>
        <Sep />
        <Btn onClick={addLink} title="Insert link" shortcut="⌘K"><Link2 size={16} /></Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label="Message body"
        onInput={() => { if (ref.current) onChange(ref.current.innerHTML) }}
        className="rte-content px-3.5 py-3 text-[14px] leading-[1.6] outline-none overflow-y-auto"
        style={{ minHeight, maxHeight: 340, color: '#202124' }}
      />
    </div>
  )
}
