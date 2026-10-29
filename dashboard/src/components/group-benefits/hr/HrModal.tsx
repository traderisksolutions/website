'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The house modal: a grey blurred backdrop that fades, a white panel that rises and fades, the
 * reverse on close. The panel sits at a fixed offset from the top with no centring transform, so
 * the rise animation never fights the positioning.
 */
export function HrModal({ open, onClose, title, children, className, width = 680 }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string; width?: number
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-[#0f1412]/30 backdrop-blur-[6px] duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed left-0 right-0 top-[6vh] z-50 mx-auto flex max-h-[88vh] flex-col overflow-hidden rounded-[16px] bg-white',
            'shadow-[0_24px_64px_rgba(15,20,18,0.2)] duration-200',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4',
            className,
          )}
          style={{ width: `min(calc(100% - 32px), ${width}px)`, color: '#0f1412' }}>
          <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-3">
            <DialogPrimitive.Title className="m-0 text-[20px] font-medium leading-tight tracking-[-0.02em]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-0 bg-transparent cursor-pointer hover:bg-[#f1f2ee]" style={{ color: '#4a5550' }}>
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-6 pb-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
