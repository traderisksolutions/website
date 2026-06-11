'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import type React from 'react'

interface RichEditorProps {
  /** Initial content as plain text. Changes cause a full editor reset via `key`. */
  initialHtml: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}

export function RichEditor({ initialHtml, onChange, placeholder = 'Write your message…', minHeight = 180 }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialHtml,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        style: `min-height:${minHeight}px; outline:none; padding:10px 12px; font-size:13px; line-height:1.65; color:#1e3a5f; font-family:inherit`,
      },
    },
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
  })

  if (!editor) return null

  function tb(active: boolean, extra?: React.CSSProperties): React.CSSProperties {
    return {
      padding: '3px 7px', fontSize: 12, fontWeight: 700,
      border: '1px solid', borderColor: active ? '#2563eb' : '#e5e7eb',
      borderRadius: 5, background: active ? '#eff6ff' : '#fff',
      color: active ? '#2563eb' : '#555', cursor: 'pointer', lineHeight: 1,
      ...extra,
    }
  }

  return (
    <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 8px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', flexWrap: 'wrap' }}>
        <button type="button" title="Bold"
          onMouseDown={e => { e.preventDefault(); editor.chain().toggleBold().run() }}
          style={tb(editor.isActive('bold'))}>B</button>

        <button type="button" title="Italic"
          onMouseDown={e => { e.preventDefault(); editor.chain().toggleItalic().run() }}
          style={tb(editor.isActive('italic'), { fontStyle: 'italic' })}>I</button>

        <button type="button" title="Underline"
          onMouseDown={e => { e.preventDefault(); editor.chain().toggleUnderline().run() }}
          style={tb(editor.isActive('underline'), { textDecoration: 'underline' })}>U</button>

        <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 3px' }} />

        <button type="button" title="Bullet list"
          onMouseDown={e => { e.preventDefault(); editor.chain().toggleBulletList().run() }}
          style={tb(editor.isActive('bulletList'))}>• —</button>

        <button type="button" title="Numbered list"
          onMouseDown={e => { e.preventDefault(); editor.chain().toggleOrderedList().run() }}
          style={tb(editor.isActive('orderedList'))}>1. —</button>

        <div style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 3px' }} />

        <button type="button" title={editor.isActive('link') ? 'Remove link' : 'Insert link'}
          onMouseDown={e => {
            e.preventDefault()
            if (editor.isActive('link')) {
              editor.chain().unsetLink().run()
            } else {
              const url = window.prompt('Enter URL:')
              if (url) editor.chain().setLink({ href: url }).run()
            }
          }}
          style={tb(editor.isActive('link'))}>🔗</button>
      </div>

      {/* ── Editor area ── */}
      <div style={{ position: 'relative' }}>
        {editor.isEmpty && (
          <p style={{ position: 'absolute', top: 10, left: 12, margin: 0, fontSize: 13, color: '#aaa', pointerEvents: 'none', zIndex: 1 }}>
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

/** Convert plain text (from AI / stored draft) to basic HTML for the editor */
export function plainToHtml(text: string): string {
  if (!text?.trim()) return ''
  return text
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Convert editor HTML to plain text for sending as email body */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/ul>|<\/ol>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
