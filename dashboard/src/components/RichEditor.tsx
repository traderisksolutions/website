'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Bold, Italic, Underline as ULIcon, Strikethrough, Baseline,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, IndentIncrease, IndentDecrease, TextQuote,
  List, ListOrdered, Link2, ImageIcon, Table2, Minus, Paperclip,
  Undo2, Redo2, RemoveFormatting, Maximize2, Minimize2,
} from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/utils'
import { TbGroup, TbButton, TbMenu, TbMenuItem, TbMenuLabel } from '@/components/engagement-agent/compose-toolbar'
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
  /** Renders an "Attach" button in the toolbar that calls straight into the caller's own
   *  file-attach flow (any file type — a document, not an inline image). Optional so RichEditor's
   *  other call sites (which have no attach flow of their own) are unaffected. */
  onAttachClick?: () => void
  /** Fires with the editor content's natural (unclipped) scrollHeight on every change, so a
   *  caller wrapping this in a fixed-height, resizable box (e.g. the reply composer) can grow
   *  that box to fit instead of just scrolling inside it. Optional; RichEditor itself never
   *  resizes anything — it only reports the number. */
  onContentHeightChange?: (h: number) => void
  /** 'compact' (default; the campaign, Nexus and inline-reply call sites): 14px body, 12px 14px
   *  padding. 'reading' (the mail composer and the New email dialog): 16px / 1.6, padding 16px
   *  on top of the horizontal gutter `--re-gutter` (40px unless the caller sets the variable). */
  variant?: 'compact' | 'reading'
  /** Extra toolbar groups (Attach, Template, Assist) rendered after the insert group. Build them
   *  from TbGroup / TbButton / TbMenu in engagement-agent/compose-toolbar.tsx. */
  toolbarExtras?: ReactNode
  /** When `onToggleFullscreen` is given, a full-screen toggle closes the toolbar. */
  fullscreen?:         boolean
  onToggleFullscreen?: () => void
  className?:     string
  /** Applied to the scrollable body wrapper (the Quill mount + signature preview), so a caller
   *  can give it a fixed or flexible height independently of the toolbar. */
  bodyClassName?: string
  bodyStyle?:     CSSProperties
}

const FONTS = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana']
const SIZES = ['10px', '12px', '14px', '16px', '18px', '24px', '32px']
const TEXT_COLOURS = ['#202124', '#3c4043', '#5f6368', '#80868b', '#c5221f', '#1a73e8', '#188038', '#b06000']
const HIGHLIGHTS   = ['#FFF6D8', '#EAF2FF', '#EAF6EC', '#F1EEFF', '#FFF0E7']
const HEADERS: { label: string; value: 1 | 2 | 3 | false }[] = [
  { label: 'Paragraph', value: false }, { label: 'Heading 1', value: 1 }, { label: 'Heading 2', value: 2 }, { label: 'Heading 3', value: 3 },
]

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = IS_MAC ? '⌘' : 'Ctrl+'

// Editor chrome on the tokens. Quill's snow theme sets the container and editor to height:100%
// with its own scrollbar; the wrapper below is the single scroller, so both go back to auto.
const EDITOR_CSS = `
.trs-re .ql-container.ql-snow{border:none!important;height:auto;font-family:inherit;font-size:inherit;margin:0}
.trs-re .ql-editor{height:auto;overflow:visible;outline:none;color:#202124;font-family:inherit;white-space:pre-wrap;tab-size:4}
.trs-re[data-variant="compact"] .ql-editor{font-size:14px;line-height:1.6;padding:12px 14px}
.trs-re[data-variant="compact"][data-borderless="true"] .ql-editor{padding:14px 0 8px}
.trs-re[data-variant="reading"] .ql-editor{font-size:16px;line-height:1.6;padding:16px var(--re-gutter,40px) 8px}
.trs-re .ql-editor p{margin:0 0 14px}
.trs-re .ql-editor p:last-child{margin-bottom:0}
.trs-re .ql-editor h1{font-size:1.5em;font-weight:500;letter-spacing:-.02em;margin:0 0 12px}
.trs-re .ql-editor h2{font-size:1.25em;font-weight:500;letter-spacing:-.01em;margin:0 0 10px}
.trs-re .ql-editor h3{font-size:1.1em;font-weight:500;margin:0 0 8px}
.trs-re .ql-editor blockquote{border-left:2px solid #e8eaed;margin:0 0 14px;padding-left:16px;color:#3c4043}
.trs-re .ql-editor a{color:#202124;text-decoration:underline;text-decoration-color:#9aa0a6;text-underline-offset:3px}
.trs-re .ql-editor hr{border:0;border-top:1px solid #e8eaed;margin:16px 0}
.trs-re .ql-editor img{max-width:100%;height:auto;display:block;margin:8px 0;border-radius:4px}
.trs-re .ql-editor.ql-blank::before{color:#80868b;font-style:normal;left:auto;right:auto}
.trs-re[data-variant="compact"] .ql-editor.ql-blank::before{left:14px}
.trs-re[data-variant="compact"][data-borderless="true"] .ql-editor.ql-blank::before{left:0}
.trs-re[data-variant="reading"] .ql-editor.ql-blank::before{left:var(--re-gutter,40px)}
.trs-re .ql-snow .ql-tooltip{display:none}
`

export function RichEditor({
  initialHtml,
  onChange,
  placeholder = 'Write your message…',
  minHeight = 180,
  sigHtml,
  borderless = false,
  onAttachClick,
  onContentHeightChange,
  variant = 'compact',
  toolbarExtras,
  fullscreen,
  onToggleFullscreen,
  className,
  bodyClassName,
  bodyStyle,
}: RichEditorProps) {
  const mountRef     = useRef<HTMLDivElement>(null)
  const quillRef     = useRef<import('quill').default | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const onChangeRef  = useRef(onChange)
  onChangeRef.current = onChange
  const onContentHeightChangeRef = useRef(onContentHeightChange)
  onContentHeightChangeRef.current = onContentHeightChange

  const [fmt,          setFmt]          = useState<Record<string, unknown>>({})
  const [imgUploading, setImgUploading] = useState(false)
  const [canUndo,      setCanUndo]      = useState(false)
  const [canRedo,      setCanRedo]      = useState(false)

  useEffect(() => {
    if (!mountRef.current || quillRef.current) return
    // StrictMode runs effects twice in dev; a stale Quill instance can leave DOM behind that a
    // second `new Quill()` call would misinterpret as initial content. Start from a clean node.
    mountRef.current.innerHTML = ''
    let alive = true

    ;(async () => {
      try {
        const [{ default: Quill }, { AlignStyle }, { FontStyle }, { SizeStyle }, { BlockEmbed }, { default: QuillTableBetter }] = await Promise.all([
          import('quill'),
          import('quill/formats/align'),
          import('quill/formats/font'),
          import('quill/formats/size'),
          import('quill/blots/block'),
          import('quill-table-better'),
        ])
        if (!alive || !mountRef.current) return

        // Inline style attributors (not Quill's default ql-* classes) so alignment, font and size
        // survive in a sent email, which carries none of this page's CSS. Registering under
        // `formats/…` (not `attributors/…`) is what actually swaps them into Parchment's registry.
        FontStyle.whitelist = FONTS
        SizeStyle.whitelist = SIZES
        class Divider extends BlockEmbed {
          static blotName = 'divider'
          static tagName  = 'hr'
        }
        Quill.register({
          'formats/align':   AlignStyle,
          'formats/font':    FontStyle,
          'formats/size':    SizeStyle,
          'formats/divider': Divider,
        }, true)
        Quill.register({ 'modules/table-better': QuillTableBetter }, true)

        let q: import('quill').default | null = null
        const promptLink = () => {
          if (!q) return
          const range = q.getSelection(true)
          const current = range ? q.getFormat(range) : {}
          if (current.link) { q.format('link', false, 'user'); return }
          const url = window.prompt('Enter URL (include https://):')
          if (url?.trim()) q.format('link', url.trim(), 'user')
        }

        q = new Quill(mountRef.current, {
          theme: 'snow',
          modules: {
            // quill-table-better reads `quill.getModule('toolbar').container` during its own init
            // (to auto-enable/disable table buttons on selection) — `toolbar: false` makes that
            // module lookup return undefined and crashes the whole `new Quill()` call. An empty
            // toolbar container satisfies that lookup without rendering Quill's own toolbar UI —
            // this editor's toolbar is the one rendered below. The resulting empty `.ql-toolbar`
            // element it inserts is hidden a few lines down.
            toolbar: { container: [] },
            history: { delay: 1000, maxStack: 100, userOnly: true },
            keyboard: { bindings: { link: { key: 'k', shortKey: true, handler: () => { promptLink() } } } },
            table: false,
            'table-better': { menus: ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'copy', 'delete'] },
          },
          placeholder,
          // Quill's `formats` is a blot-name allowlist, not a module-name one — the table entries
          // are the actual blot names quill-table-better registers (verified against its compiled
          // bundle), needed or table content gets silently stripped on input/paste.
          formats: [
            'bold', 'italic', 'underline', 'strike', 'color', 'background',
            'header', 'font', 'size', 'align', 'list', 'indent', 'blockquote', 'link', 'image', 'divider',
            'table-body', 'table-cell', 'table-cell-block', 'table-col', 'table-colgroup',
            'table-container', 'table-header', 'table-list', 'table-list-container', 'table-row',
            'table-temporary', 'table-th', 'table-th-block', 'table-th-row', 'table-thead',
          ],
        })

        // The empty toolbar module above still inserts a real (but button-less) .ql-toolbar
        // element as the previous sibling of the container — hide it, we render our own toolbar.
        const autoToolbar = mountRef.current.previousElementSibling
        if (autoToolbar?.classList.contains('ql-toolbar')) (autoToolbar as HTMLElement).style.display = 'none'

        const editorEl = mountRef.current.querySelector<HTMLElement>('.ql-editor')
        if (editorEl) editorEl.style.minHeight = `${minHeight}px`

        if (initialHtml?.trim()) {
          q.clipboard.dangerouslyPasteHTML(0, initialHtml)
        }
        q.setSelection(q.getLength(), 0)

        const syncFmt = () => {
          if (!q) return
          const sel = q.getSelection()
          setFmt(sel ? q.getFormat(sel) : {})
          setCanUndo(q.history.stack.undo.length > 0)
          setCanRedo(q.history.stack.redo.length > 0)
        }

        q.on('selection-change', syncFmt)
        q.on('text-change', () => {
          if (!q) return
          syncFmt()
          // Per quill-table-better's docs: hide its contextual row/column menu before serializing,
          // so that internal UI markup never leaks into the saved/sent HTML.
          ;(q.getModule('table-better') as TableBetterModule | undefined)?.hideTools()
          onChangeRef.current(q.getSemanticHTML())
          // .ql-editor is the actual content element Quill creates inside the container we
          // mounted into — its scrollHeight is the content's true (unclipped) height.
          const contentEl = mountRef.current?.querySelector<HTMLElement>('.ql-editor')
          if (contentEl) onContentHeightChangeRef.current?.(contentEl.scrollHeight)
        })

        quillRef.current = q

        // Report the height of the content we were mounted WITH, not only of what gets typed
        // afterwards. The handler above hangs off Quill's 'text-change', which initialHtml does
        // not raise, so a consumer sizing itself to its content never heard about the content it
        // started with — the reply editor kept whatever height the last long draft had left it,
        // and a two-paragraph reply sat in a box three times its size. One frame later, so the
        // first layout has happened and scrollHeight is real.
        requestAnimationFrame(() => {
          const contentEl = mountRef.current?.querySelector<HTMLElement>('.ql-editor')
          if (contentEl) onContentHeightChangeRef.current?.(contentEl.scrollHeight)
        })
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

  function insertEmbedAtCursor(type: string, value: unknown) {
    const q = quillRef.current
    if (!q) return
    const range = q.getSelection(true) ?? { index: q.getLength() - 1, length: 0 }
    q.insertEmbed(range.index, type, value, 'user')
    q.setSelection(range.index + 1, 0, 'user')
  }

  function handleInsertImageUrl() {
    const url = window.prompt('Image URL (must start with https://):')
    if (url?.trim().startsWith('http')) insertEmbedAtCursor('image', url.trim())
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
      if (data.url) insertEmbedAtCursor('image', data.url)
      else alert(data.error ?? 'Image upload failed')
    } catch {
      alert('Image upload failed — check your connection')
    } finally {
      setImgUploading(false)
    }
  }

  function toggleLink() {
    const q = quillRef.current
    if (!q) return
    if (fmt.link) { q.format('link', false, 'user'); return }
    const url = window.prompt('Enter URL (include https://):')
    if (url?.trim()) q.format('link', url.trim(), 'user')
  }

  function indent(delta: 1 | -1) {
    const cur = parseInt(String(fmt.indent ?? 0), 10) || 0
    const next = Math.max(0, cur + delta)
    apply('indent', next || false)
  }

  function clearFormatting() {
    const q = quillRef.current
    if (!q) return
    const r = q.getSelection(true)
    if (r) q.removeFormat(r.index, r.length, 'user')
  }

  const headerLabel = HEADERS.find(h => h.value === (fmt.header ?? false))?.label ?? 'Paragraph'
  const fontLabel   = typeof fmt.font === 'string' ? fmt.font : 'Inter'
  const sizeLabel   = typeof fmt.size === 'string' ? fmt.size.replace('px', '') : (variant === 'reading' ? '16' : '14')
  const alignActive = typeof fmt.align === 'string' && fmt.align !== ''

  const Swatch = ({ colour, on, label, onPick }: { colour: string | null; on: boolean; label: string; onPick: () => void }) => (
    <button type="button" role="menuitemradio" aria-checked={on} aria-label={label} title={label}
      onMouseDown={e => e.preventDefault()} onClick={onPick}
      className={cn('w-6 h-6 rounded-full border cursor-pointer inline-flex items-center justify-center bg-white', on ? 'border-[#202124] ring-2 ring-[#202124]/20' : 'border-[#dadce0] hover:border-[#9aa0a6]')}
      style={colour ? { background: colour } : undefined}>
      {!colour && <Minus size={12} strokeWidth={2} className="text-[#5f6368]" aria-hidden />}
    </button>
  )

  return (
    <div
      data-variant={variant}
      data-borderless={borderless ? 'true' : 'false'}
      className={cn(
        'trs-re flex flex-col min-w-0',
        borderless ? '' : 'border border-[#dadce0] rounded-[10px] bg-white overflow-hidden',
        className,
      )}
    >
      <style>{EDITOR_CSS}</style>

      {/* ── Toolbar — grouped, one calm row, wraps on narrow ── */}
      <div role="toolbar" aria-label="Formatting" className={cn(
        'flex items-center gap-0.5 flex-wrap py-2 border-b border-[#e8eaed]',
        variant === 'reading' ? 'px-[var(--re-gutter,40px)]' : (borderless ? 'px-0' : 'px-2'),
      )}>
        <TbGroup label="Paragraph style">
          <TbMenu label="Paragraph style" trigger={headerLabel} width={170}>
            {close => HEADERS.map(h => (
              <TbMenuItem key={h.label} active={(fmt.header ?? false) === h.value} onSelect={() => { apply('header', h.value); close() }}>{h.label}</TbMenuItem>
            ))}
          </TbMenu>
        </TbGroup>

        <TbGroup label="Text style">
          <TbButton label="Bold" shortcut={`${MOD}B`} active={!!fmt.bold} onPress={() => apply('bold', !fmt.bold)}><Bold size={15} strokeWidth={2.5} /></TbButton>
          <TbButton label="Italic" shortcut={`${MOD}I`} active={!!fmt.italic} onPress={() => apply('italic', !fmt.italic)}><Italic size={15} strokeWidth={2} /></TbButton>
          <TbButton label="Underline" shortcut={`${MOD}U`} active={!!fmt.underline} onPress={() => apply('underline', !fmt.underline)}><ULIcon size={15} strokeWidth={2} /></TbButton>
          <TbButton label="Strikethrough" active={!!fmt.strike} onPress={() => apply('strike', !fmt.strike)}><Strikethrough size={15} strokeWidth={2} /></TbButton>
          <TbMenu label="Text colour and highlight" text={false} active={!!fmt.color || !!fmt.background} trigger={<Baseline size={15} strokeWidth={2} />} width={232}>
            {close => (
              <div className="pb-1.5">
                <TbMenuLabel>Text</TbMenuLabel>
                <div className="flex flex-wrap gap-1.5 px-2.5">
                  <Swatch colour={null} on={!fmt.color} label="Default text colour" onPick={() => { apply('color', false); close() }} />
                  {TEXT_COLOURS.map(c => <Swatch key={c} colour={c} on={fmt.color === c} label={`Text ${c}`} onPick={() => { apply('color', c); close() }} />)}
                </div>
                <TbMenuLabel>Highlight</TbMenuLabel>
                <div className="flex flex-wrap gap-1.5 px-2.5">
                  <Swatch colour={null} on={!fmt.background} label="No highlight" onPick={() => { apply('background', false); close() }} />
                  {HIGHLIGHTS.map(c => <Swatch key={c} colour={c} on={fmt.background === c} label={`Highlight ${c}`} onPick={() => { apply('background', c); close() }} />)}
                </div>
              </div>
            )}
          </TbMenu>
        </TbGroup>

        <TbGroup label="Font">
          <TbMenu label="Font family" trigger={fontLabel} width={190}>
            {close => FONTS.map(f => (
              <TbMenuItem key={f} active={(fmt.font ?? 'Inter') === f} onSelect={() => { apply('font', f === 'Inter' ? false : f); close() }} style={{ fontFamily: f === 'Inter' ? undefined : f }}>{f}</TbMenuItem>
            ))}
          </TbMenu>
          <TbMenu label="Font size" trigger={sizeLabel} width={110}>
            {close => (
              <>
                <TbMenuItem active={!fmt.size} onSelect={() => { apply('size', false); close() }}>Default</TbMenuItem>
                {SIZES.map(s => <TbMenuItem key={s} active={fmt.size === s} onSelect={() => { apply('size', s); close() }}>{s.replace('px', '')}</TbMenuItem>)}
              </>
            )}
          </TbMenu>
        </TbGroup>

        <TbGroup label="Lists and layout">
          <TbButton label="Bulleted list" shortcut={`${MOD}⇧8`} active={fmt.list === 'bullet'} onPress={() => apply('list', fmt.list === 'bullet' ? false : 'bullet')}><List size={16} /></TbButton>
          <TbButton label="Numbered list" shortcut={`${MOD}⇧7`} active={fmt.list === 'ordered'} onPress={() => apply('list', fmt.list === 'ordered' ? false : 'ordered')}><ListOrdered size={16} /></TbButton>
          <TbButton label="Decrease indent" shortcut="⇧Tab" onPress={() => indent(-1)}><IndentDecrease size={16} /></TbButton>
          <TbButton label="Increase indent" shortcut="Tab" onPress={() => indent(1)}><IndentIncrease size={16} /></TbButton>
          <TbMenu label="Align" text={false} active={alignActive} trigger={
            fmt.align === 'center' ? <AlignCenter size={16} /> : fmt.align === 'right' ? <AlignRight size={16} /> : fmt.align === 'justify' ? <AlignJustify size={16} /> : <AlignLeft size={16} />
          } width={150}>
            {close => (
              <>
                <TbMenuItem active={!alignActive} onSelect={() => { apply('align', false); close() }}>Left</TbMenuItem>
                <TbMenuItem active={fmt.align === 'center'} onSelect={() => { apply('align', 'center'); close() }}>Centre</TbMenuItem>
                <TbMenuItem active={fmt.align === 'right'} onSelect={() => { apply('align', 'right'); close() }}>Right</TbMenuItem>
                <TbMenuItem active={fmt.align === 'justify'} onSelect={() => { apply('align', 'justify'); close() }}>Justify</TbMenuItem>
              </>
            )}
          </TbMenu>
          <TbButton label="Quote" active={!!fmt.blockquote} onPress={() => apply('blockquote', !fmt.blockquote)}><TextQuote size={16} /></TbButton>
        </TbGroup>

        <TbGroup label="Insert">
          <TbButton label={fmt.link ? 'Remove link' : 'Insert link'} shortcut={`${MOD}K`} active={!!fmt.link} onPress={toggleLink}><Link2 size={16} /></TbButton>
          <TbButton label="Insert table" onPress={() => {
            const table = quillRef.current?.getModule('table-better') as TableBetterModule | undefined
            table?.insertTable(3, 3)
          }}><Table2 size={16} /></TbButton>
          <TbMenu label={imgUploading ? 'Uploading image…' : 'Insert image'} text={false} caret={false} disabled={imgUploading} trigger={<ImageIcon size={16} />} width={190}>
            {close => (
              <>
                <TbMenuItem onSelect={() => { fileInputRef.current?.click(); close() }}>Upload from device</TbMenuItem>
                <TbMenuItem onSelect={() => { close(); handleInsertImageUrl() }}>From a link</TbMenuItem>
              </>
            )}
          </TbMenu>
          <TbButton label="Divider" onPress={() => insertEmbedAtCursor('divider', true)}><Minus size={16} /></TbButton>
        </TbGroup>

        {(onAttachClick || toolbarExtras) && (
          <>
            {onAttachClick && (
              <TbGroup label="Attach">
                <TbButton label="Attach files" text onPress={onAttachClick}><Paperclip size={15} /> Attach</TbButton>
              </TbGroup>
            )}
            {toolbarExtras}
          </>
        )}

        <TbGroup label="History">
          <TbButton label="Undo" shortcut={`${MOD}Z`} disabled={!canUndo} onPress={() => quillRef.current?.history.undo()}><Undo2 size={16} /></TbButton>
          <TbButton label="Redo" shortcut={`⇧${MOD}Z`} disabled={!canRedo} onPress={() => quillRef.current?.history.redo()}><Redo2 size={16} /></TbButton>
          <TbButton label="Clear formatting" onPress={clearFormatting}><RemoveFormatting size={16} /></TbButton>
          {onToggleFullscreen && (
            <TbButton label={fullscreen ? 'Exit full screen' : 'Full screen'} shortcut={fullscreen ? 'Esc' : undefined} active={!!fullscreen} onPress={onToggleFullscreen}>
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </TbButton>
          )}
        </TbGroup>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleImageUpload}
          aria-hidden
          tabIndex={-1}
        />
      </div>

      {/* ── Body: the Quill mount and the signature preview scroll together ── */}
      <div className={cn('min-w-0', bodyClassName)} style={bodyStyle}>
        <div ref={mountRef} />

        {/* Signature preview (non-editable). sigHtml carries its own leading <br><hr> because the
            same string is reused verbatim for the sent-email HTML; in this preview that divider
            would double up with the hairline above, so it is stripped here only. */}
        {sigHtml && (
          <div
            style={{ pointerEvents: 'none', userSelect: 'none', opacity: 0.7 }}
            className={cn(
              'border-t border-[#e8eaed] pt-3 pb-3',
              variant === 'reading' ? 'mx-[var(--re-gutter,40px)]' : (borderless ? 'mx-0' : 'mx-3.5'),
            )}
            dangerouslySetInnerHTML={{ __html: sigHtml.replace(/^\s*(<br\s*\/?>)?\s*<hr[^>]*>/i, '') }}
          />
        )}
      </div>
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
