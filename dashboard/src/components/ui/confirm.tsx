'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Btn } from '@/components/crm/primitives'

/**
 * "Are you sure" for every Remove, Delete or Discard (Jarod, 19 Nov 2026): a modal that names the
 * thing and what is and is not affected, Cancel and the action. Never the browser's confirm(), which
 * some browsers and the artifact viewer block. Apple motion: the page behind fades to a grey blur,
 * the 28px panel rises and fades in; closing runs the same in reverse.
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Remove WICA?', body: 'The thread stays in the Inbox.', action: 'Remove', danger: true }))) return
 */
export type ConfirmOptions = { title: string; body?: string; action?: string; cancel?: string; danger?: boolean }
type Ask = (o: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const ask = useCallback<Ask>(o => new Promise<boolean>(res => { resolver.current?.(false); resolver.current = res; setOpts(o) }), [])
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null) }
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <DialogPrimitive.Root open={!!opts} onOpenChange={o => { if (!o) close(false) }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="trs-modal-overlay fixed inset-0 z-[100]" />
          <DialogPrimitive.Content className="trs-modal-panel fixed left-1/2 top-1/2 z-[101] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded bg-white px-8 pt-7 pb-6 shadow-[0_30px_80px_rgba(15,20,18,0.25)] focus:outline-none">
            <DialogPrimitive.Close aria-label="Close" className="absolute right-[18px] top-[18px] inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-trs-field text-trs-ink-2 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-trs-green">
              <X size={16} />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="m-0 pr-10 text-heading font-semibold leading-tight text-trs-ink">{opts?.title}</DialogPrimitive.Title>
            {opts?.body ? <DialogPrimitive.Description className="mt-2 mb-0 text-body leading-relaxed text-trs-muted">{opts.body}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{opts?.title}</DialogPrimitive.Description>}
            <div className="mt-6 flex justify-end gap-2">
              <Btn onClick={() => close(false)}>{opts?.cancel ?? 'Cancel'}</Btn>
              <Btn level={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{opts?.action ?? 'Confirm'}</Btn>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </ConfirmContext.Provider>
  )
}

/** The confirm function. Outside a provider (a public page) it falls back to the browser's dialog. */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext)
  return ask ?? (async o => window.confirm([o.title, o.body].filter(Boolean).join('\n\n')))
}
