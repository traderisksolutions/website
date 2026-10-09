"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog>: focus trap, Esc to close and a top-layer backdrop come from the browser.
 *  Header row: optional back button, centred title, close button. */
export function Modal({ open, onClose, onBack, title, eyebrow = true, wide = false, children }: {
  open: boolean; onClose: () => void; onBack?: () => void; title: string; eyebrow?: boolean; wide?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      className={`modal m-auto w-[calc(100%-24px)] p-0 transition-[max-width] ${wide ? "max-w-[1040px]" : "max-w-[600px]"}`}
    >
      <div className="max-h-[calc(100dvh-32px)] overflow-y-auto px-5 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5">
        <div className="mb-5 grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label="All options" className="glass grid size-9 place-items-center">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
          ) : <span />}
          {eyebrow ? <p className="text-center text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-ink-3">{title}</p> : <span />}
          <button type="button" onClick={onClose} aria-label="Close" className="glass grid size-9 place-items-center justify-self-end">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
