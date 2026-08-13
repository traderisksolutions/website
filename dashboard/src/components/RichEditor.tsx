'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline as ULIcon,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Link2, ImageIcon, Upload, Table2, Paperclip,
} from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import 'quill/dist/quill.snow.css'
import 'quill-table-better/dist/quill-table-better.css'

/** The subset of quill-table-better's module API this editor actually calls — see
 *  node_modules/quill-table-better/dist/quill-table-better.d.ts for the full surface. */
interface TableBetterModule {
  insertTable(rows: number, columns: number): void
  hideTools(): void
}

interface RichEditorProps {
  initialHtml: string
  onChange:    (html: string) => void
  placeholder?: string
  minHeight?:   number
  sigHtml?:     string
  borderless?:  boolean
  /** Renders a paperclip button in the toolbar, next to the image icons, that calls straight
   *  into the caller's own file-attach flow (any file type — a document, not an inline image).
   *  Optional so RichEditor's other call sites (which have no attach flow of their own) are
   *  unaffected. Exists because the toolbar's adjacent "Upload image from device" button
   *  (image-only accept) kept getting clicked by users expecting a generic attach — this gives
   *  them a correctly-labeled, unrestricted option right where they're already looking instead. */
  onAttachClick?: () => void
}

export function RichEditor({
  initialHtml,
  onChange,
  placeholder = 'Write your message…',
  minHeight = 180,
  sigHtml,
  borderless = false,
  onAttachClick,
}: RichEditorProps) {
  const mountRef    = useRef<HTMLDivElement>(null)
  const quillRef    = useRef<import('quill').default | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const [fmt,         setFmt]         = useState<Record<string, unknown>>({})
  const [hasSel,      setHasSel]      = useState(false)
  const [imgUploading, setImgUploading] = useState(false)

  useEffect(() => {
    if (!mountRef.current || quillRef.current) return
    // StrictMode runs effects twice in dev; a stale Quill instance can leave DOM behind that a
    // second `new Quill()` call would misinterpret as initial content. Start from a clean node.
    mountRef.current.innerHTML = ''
    let alive = true

    ;(async () => {
      try {
        const [{ default: Quill }, { AlignStyle }, { default: QuillTableBetter }] = await Promise.all([
          import('quill'),
          import('quill/formats/align'),
          import('quill-table-better'),
        ])
        if (!alive || !mountRef.current) return

        // Use inline style attributor so alignment renders in emails without external CSS
        Quill.register({ 'attributors/style/align': AlignStyle }, true)
        Quill.register({ 'modules/table-better': QuillTableBetter }, true)

        const q = new Quill(mountRef.current, {
          theme: 'snow',
          modules: {
            // quill-table-better reads `quill.getModule('toolbar').container` during its own init
            // (to auto-enable/disable table buttons on selection) — `toolbar: false` makes that
            // module lookup return undefined and crashes the whole `new Quill()` call before this
            // component ever gets a reference to it, which is why every button silently did
            // nothing and the default Quill border was never stripped below. An empty toolbar
            // container satisfies that lookup without rendering Quill's own toolbar UI — this
            // editor's toolbar is the hand-rolled one below. The resulting empty `.ql-toolbar`
            // element it inserts is hidden a few lines down.
            toolbar: { container: [] },
            history: { delay: 1000, maxStack: 100, userOnly: true },
            table: false,
            'table-better': { menus: ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'copy', 'delete'] },
          },
          placeholder,
          // Quill's `formats` is a blot-name allowlist, not a module-name one — 'table-better' (the
          // module name) wouldn't allowlist anything; these are the actual blot names the table
          // module registers (verified against its compiled bundle), needed or table content gets
          // silently stripped on input/paste the same way an unlisted format always would.
          formats: [
            'bold', 'italic', 'underline', 'align', 'list', 'link', 'image',
            'table-body', 'table-cell', 'table-cell-block', 'table-col', 'table-colgroup',
            'table-container', 'table-header', 'table-list', 'table-list-container', 'table-row',
            'table-temporary', 'table-th', 'table-th-block', 'table-th-row', 'table-thead',
          ],
        })

        // The empty toolbar module above still inserts a real (but button-less) .ql-toolbar
        // element as the previous sibling of the container — hide it, we render our own toolbar.
        const autoToolbar = mountRef.current.previousElementSibling
        if (autoToolbar?.classList.contains('ql-toolbar')) (autoToolbar as HTMLElement).style.display = 'none'

        // mountRef.current IS the .ql-container element after Quill initialises
        if (borderless) {
          mountRef.current.style.cssText += ';border:none !important;margin:0'
        } else {
          mountRef.current.style.cssText += ';border:none !important;font-size:inherit'
        }

        // Apply editor content styles
        const editorEl = mountRef.current.querySelector<HTMLElement>('.ql-editor')
        if (editorEl) {
          const editorPadding = borderless ? '14px 0 8px' : '12px 14px'
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

        const syncFmt = () => {
          const sel = q.getSelection()
          setHasSel(!!sel)
          setFmt(sel ? q.getFormat(sel) : {})
        }

        q.on('selection-change', syncFmt)
        q.on('text-change', () => {
          syncFmt()
          // Per quill-table-better's docs: hide its contextual row/column menu before serializing,
          // so that internal UI markup never leaks into the saved/sent HTML.
          ;(q.getModule('table-better') as TableBetterModule | undefined)?.hideTools()
          onChangeRef.current(q.getSemanticHTML())
        })

        quillRef.current = q
      } catch (e) {
        console.error('[RichEditor] failed to initialise:', e)
      }
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

  function btnClass(active: boolean) {
    return cn(
      'flex items-center justify-center rounded-md w-8 h-8 leading-none transition-colors',
      active
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground/70 hover:bg-black/[.04] hover:text-foreground',
    )
  }

  const Sep = () => <div className="w-px h-5 bg-[--border-subtle] mx-1.5 flex-shrink-0" />

  return (
    <div className={borderless
      ? 'overflow-hidden'
      : 'border border-[--border-subtle] rounded-lg bg-card overflow-hidden'
    }>

      {/* ── Toolbar — grouped: text style | alignment | lists | insert ── */}
      <div className={cn(
        'flex items-center gap-0.5 flex-wrap',
        borderless ? 'px-1 py-1.5 rounded-lg bg-muted/50' : 'px-2 py-1.5 border-b border-[--border-subtle] bg-muted/40',
      )}>

        {/* Text style */}
        <button type="button" title="Bold" className={btnClass(!!fmt.bold)}
          onMouseDown={e => { e.preventDefault(); apply('bold', !fmt.bold) }}>
          <Bold size={14} strokeWidth={2.5} />
        </button>

        <button type="button" title="Italic" className={btnClass(!!fmt.italic)}
          onMouseDown={e => { e.preventDefault(); apply('italic', !fmt.italic) }}>
          <Italic size={14} strokeWidth={2} />
        </button>

        <button type="button" title="Underline" className={btnClass(!!fmt.underline)}
          onMouseDown={e => { e.preventDefault(); apply('underline', !fmt.underline) }}>
          <ULIcon size={14} strokeWidth={2} />
        </button>

        <Sep />

        {/* Alignment */}
        <button type="button" title="Align left" className={btnClass(hasSel && !fmt.align)}
          onMouseDown={e => { e.preventDefault(); apply('align', false) }}>
          <AlignLeft size={14} />
        </button>

        <button type="button" title="Align center" className={btnClass(fmt.align === 'center')}
          onMouseDown={e => { e.preventDefault(); apply('align', fmt.align === 'center' ? false : 'center') }}>
          <AlignCenter size={14} />
        </button>

        <button type="button" title="Align right" className={btnClass(fmt.align === 'right')}
          onMouseDown={e => { e.preventDefault(); apply('align', fmt.align === 'right' ? false : 'right') }}>
          <AlignRight size={14} />
        </button>

        <Sep />

        {/* Lists */}
        <button type="button" title="Bullet list" className={btnClass(fmt.list === 'bullet')}
          onMouseDown={e => { e.preventDefault(); apply('list', fmt.list === 'bullet' ? false : 'bullet') }}>
          <List size={14} />
        </button>

        <button type="button" title="Numbered list" className={btnClass(fmt.list === 'ordered')}
          onMouseDown={e => { e.preventDefault(); apply('list', fmt.list === 'ordered' ? false : 'ordered') }}>
          <ListOrdered size={14} />
        </button>

        <Sep />

        {/* Insert */}
        <button type="button" title={fmt.link ? 'Remove link' : 'Insert link'} className={btnClass(!!fmt.link)}
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
          <Link2 size={14} />
        </button>

        <button type="button" title="Insert table" className={btnClass(false)}
          onMouseDown={e => {
            e.preventDefault()
            const table = quillRef.current?.getModule('table-better') as TableBetterModule | undefined
            table?.insertTable(3, 3)
          }}>
          <Table2 size={14} />
        </button>

        {/* Image: paste URL */}
        <button type="button" title="Insert image from URL" className={btnClass(false)}
          onMouseDown={e => { e.preventDefault(); handleInsertImageUrl() }}>
          <ImageIcon size={14} />
        </button>

        {/* Image: upload from device */}
        <label
          title={imgUploading ? 'Uploading…' : 'Insert a picture into this email (JPG/PNG/GIF/WebP)'}
          className={cn(btnClass(false), imgUploading ? 'cursor-wait opacity-50' : 'cursor-pointer')}
        >
          <Upload size={14} />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
        </label>

        {onAttachClick && (
          <>
            <Sep />
            <button type="button" title="Attach a file — any type, e.g. PDF, Word, Excel" className={btnClass(false)}
              onMouseDown={e => { e.preventDefault(); onAttachClick() }}>
              <Paperclip size={14} />
            </button>
          </>
        )}

      </div>

      {/* ── Quill mount ── */}
      <div ref={mountRef} />

      {/* ── Signature preview (non-editable) — visually separated from the live typing area.
          sigHtml carries its own leading <br><hr> because the same string is reused verbatim
          for the actual sent-email HTML (which has none of this wrapper's CSS). In this
          in-app preview that divider would double up with the border-top below, so it's
          stripped here only — the prop itself, and every other consumer of it, is untouched. */}
      {sigHtml && (
        <div
          style={{ pointerEvents: 'none', userSelect: 'none', opacity: 0.7 }}
          className={borderless ? 'mt-1 pt-3 px-0 pb-2 border-t border-[--border-subtle]' : 'px-3 pb-3 pt-2 border-t border-[--border-subtle]'}
          dangerouslySetInnerHTML={{ __html: sigHtml.replace(/^\s*(<br\s*\/?>)?\s*<hr[^>]*>/i, '') }}
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
