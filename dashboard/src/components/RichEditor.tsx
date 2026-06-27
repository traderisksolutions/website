'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline as ULIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link2, ImageIcon, Upload,
} from 'lucide-react'
import type React from 'react'
import 'quill/dist/quill.snow.css'

interface RichEditorProps {
  initialHtml: string
  onChange:    (html: string) => void
  placeholder?: string
  minHeight?:   number
  sigHtml?:     string
  borderless?:  boolean
}

export function RichEditor({
  initialHtml,
  onChange,
  placeholder = 'Write your message…',
  minHeight = 180,
  sigHtml,
  borderless = false,
}: RichEditorProps) {
  const mountRef    = useRef<HTMLDivElement>(null)
  const quillRef    = useRef<import('quill').default | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [fmt,         setFmt]         = useState<Record<string, unknown>>({})
  const [imgUploading, setImgUploading] = useState(false)

  useEffect(() => {
    if (!mountRef.current || quillRef.current) return
    let alive = true

    ;(async () => {
      const [{ default: Quill }, { AlignStyle }] = await Promise.all([
        import('quill'),
        import('quill/formats/align'),
      ])
      if (!alive || !mountRef.current) return

      // Use inline style attributor so alignment renders in emails without external CSS
      Quill.register({ 'attributors/style/align': AlignStyle }, true)

      const q = new Quill(mountRef.current, {
        theme: 'snow',
        modules: {
          toolbar: false,
          history: { delay: 1000, maxStack: 100, userOnly: true },
        },
        placeholder,
        formats: ['bold', 'italic', 'underline', 'align', 'list', 'link', 'image'],
      })

      // Strip Quill snow's inner border/margin — our outer wrapper handles the border
      const containerEl = mountRef.current.querySelector<HTMLElement>('.ql-container')
      if (containerEl) containerEl.style.cssText += ';border:none !important;font-size:inherit'

      // Apply editor content styles
      const editorEl = mountRef.current.querySelector<HTMLElement>('.ql-editor')
      if (editorEl) {
        const editorPadding = borderless ? '8px 0' : '10px 12px'
        editorEl.style.cssText +=
          `;font-size:13px;line-height:1.65;color:#1e3a5f;font-family:inherit;min-height:${minHeight}px;padding:${editorPadding};outline:none`
        // Inject responsive image style so inserted images don't overflow the editor
        const styleEl = document.createElement('style')
        styleEl.textContent = '.ql-editor img{max-width:100%;height:auto;display:block;margin:8px 0;border-radius:4px}'
        mountRef.current?.appendChild(styleEl)
      }

      if (initialHtml?.trim()) {
        q.clipboard.dangerouslyPasteHTML(0, initialHtml)
      }
      q.setSelection(q.getLength(), 0)

      function syncFmt() {
        const sel = q.getSelection()
        setFmt(sel ? q.getFormat(sel) : {})
      }

      q.on('selection-change', syncFmt)
      q.on('text-change', () => {
        syncFmt()
        onChangeRef.current(q.getSemanticHTML())
      })

      quillRef.current = q
    })()

    return () => {
      alive = false
      quillRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function apply(name: string, val: unknown) {
    quillRef.current?.format(name, val, 'user')
  }

  function insertImageAtCursor(url: string) {
    const q = quillRef.current
    if (!q) return
    const range = q.getSelection(true) ?? { index: q.getLength() - 1, length: 0 }
    q.insertEmbed(range.index, 'image', url, 'user')
    q.setSelection(range.index + 1, 0, 'user')
  }

  function handleInsertImageUrl() {
    const url = window.prompt('Image URL (must start with https://):')
    if (url?.trim().startsWith('http')) insertImageAtCursor(url.trim())
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImgUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/upload/image', { method: 'POST', body: form })
      const data = await res.json()
      if (data.url) insertImageAtCursor(data.url)
      else alert(data.error ?? 'Image upload failed')
    } catch {
      alert('Image upload failed — check your connection')
    } finally {
      setImgUploading(false)
    }
  }

  function s(active: boolean): React.CSSProperties {
    return borderless ? {
      padding: '4px 6px', border: '1px solid',
      borderColor: active ? '#2563eb' : 'transparent',
      borderRadius: 5, background: active ? '#eff6ff' : 'transparent',
      color: active ? '#2563eb' : '#888', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
    } : {
      padding: '4px 6px', border: '1px solid',
      borderColor: active ? '#2563eb' : '#e5e7eb',
      borderRadius: 5, background: active ? '#eff6ff' : '#fff',
      color: active ? '#2563eb' : '#555', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
    }
  }

  const Sep = () => <div style={{ width: 1, height: 16, background: borderless ? 'transparent' : '#e5e7eb', margin: '0 3px' }} />

  return (
    <div style={borderless
      ? { overflow: 'hidden' }
      : { border: '1px solid #bfdbfe', borderRadius: 8, background: '#fff', overflow: 'hidden' }
    }>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '5px 8px',
        padding: borderless ? '5px 0' : '5px 8px',
        borderBottom: borderless ? 'none' : '1px solid #e5e7eb',
        background: borderless ? 'transparent' : '#f8fafc',
        flexWrap: 'wrap',
      }}>

        <button type="button" title="Bold" style={s(!!fmt.bold)}
          onMouseDown={e => { e.preventDefault(); apply('bold', !fmt.bold) }}>
          <Bold size={12} strokeWidth={2.5} />
        </button>

        <button type="button" title="Italic" style={s(!!fmt.italic)}
          onMouseDown={e => { e.preventDefault(); apply('italic', !fmt.italic) }}>
          <Italic size={12} strokeWidth={2} />
        </button>

        <button type="button" title="Underline" style={s(!!fmt.underline)}
          onMouseDown={e => { e.preventDefault(); apply('underline', !fmt.underline) }}>
          <ULIcon size={12} strokeWidth={2} />
        </button>

        <Sep />

        <button type="button" title="Align left" style={s(!fmt.align)}
          onMouseDown={e => { e.preventDefault(); apply('align', false) }}>
          <AlignLeft size={12} />
        </button>

        <button type="button" title="Align center" style={s(fmt.align === 'center')}
          onMouseDown={e => { e.preventDefault(); apply('align', fmt.align === 'center' ? false : 'center') }}>
          <AlignCenter size={12} />
        </button>

        <button type="button" title="Align right" style={s(fmt.align === 'right')}
          onMouseDown={e => { e.preventDefault(); apply('align', fmt.align === 'right' ? false : 'right') }}>
          <AlignRight size={12} />
        </button>

        <Sep />

        <button type="button" title="Bullet list" style={s(fmt.list === 'bullet')}
          onMouseDown={e => { e.preventDefault(); apply('list', fmt.list === 'bullet' ? false : 'bullet') }}>
          <List size={12} />
        </button>

        <button type="button" title="Numbered list" style={s(fmt.list === 'ordered')}
          onMouseDown={e => { e.preventDefault(); apply('list', fmt.list === 'ordered' ? false : 'ordered') }}>
          <ListOrdered size={12} />
        </button>

        <Sep />

        <button type="button" title={fmt.link ? 'Remove link' : 'Insert link'} style={s(!!fmt.link)}
          onMouseDown={e => {
            e.preventDefault()
            const q = quillRef.current
            if (!q) return
            if (fmt.link) {
              q.format('link', false, 'user')
            } else {
              const url = window.prompt('Enter URL (include https://):')
              if (url?.trim()) q.format('link', url.trim(), 'user')
            }
          }}>
          <Link2 size={12} />
        </button>

        <Sep />

        {/* Image: paste URL */}
        <button type="button" title="Insert image from URL" style={s(false)}
          onMouseDown={e => { e.preventDefault(); handleInsertImageUrl() }}>
          <ImageIcon size={12} />
        </button>

        {/* Image: upload from device */}
        <label
          title={imgUploading ? 'Uploading…' : 'Upload image from device'}
          style={{ ...s(false), cursor: imgUploading ? 'wait' : 'pointer', opacity: imgUploading ? 0.5 : 1 }}
        >
          <Upload size={12} />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
        </label>

      </div>

      {/* ── Quill mount ── */}
      <div ref={mountRef} />

      {/* ── Signature preview (non-editable) ── */}
      {sigHtml && (
        <div
          style={{ borderTop: borderless ? 'none' : '1px solid #e5e7eb', padding: '0 12px 10px', pointerEvents: 'none', userSelect: 'none', opacity: 0.7 }}
          dangerouslySetInnerHTML={{ __html: sigHtml }}
        />
      )}

    </div>
  )
}

/** Convert plain text (from AI drafts) to basic HTML paragraphs for the editor */
export function plainToHtml(text: string): string {
  if (!text?.trim()) return ''
  return text
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Convert editor HTML to plain text for storage / plain-text email part */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<\/p>/gi,          '\n\n')
    .replace(/<br\s*\/?>/gi,     '\n')
    .replace(/<\/h[1-6]>/gi,     '\n\n')
    .replace(/<li[^>]*>/gi,      '• ')
    .replace(/<\/li>/gi,         '\n')
    .replace(/<\/ul>|<\/ol>/gi,  '\n')
    .replace(/<[^>]+>/g,         '')
    .replace(/&nbsp;/g,          ' ')
    .replace(/&amp;/g,           '&')
    .replace(/&lt;/g,            '<')
    .replace(/&gt;/g,            '>')
    .replace(/&#39;/g,           "'")
    .replace(/&quot;/g,          '"')
    .replace(/\n{3,}/g,          '\n\n')
    .trim()
}
