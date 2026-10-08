"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog>: focus trap, Esc to close and a top-layer backdrop come from the browser. */
export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
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
      aria-label={label}
      onClose={onClose}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      className="modal m-auto w-[calc(100%-24px)] max-w-[600px] p-0"
    >
      <div className="relative max-h-[calc(100dvh-32px)] overflow-y-auto px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
        <button type="button" onClick={onClose} aria-label="Close" className="glass absolute right-4 top-4 grid size-8 place-items-center">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        {children}
      </div>
    </dialog>
  );
}
