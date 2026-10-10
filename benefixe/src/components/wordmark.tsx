export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[17px] font-semibold leading-none tracking-[-0.02em] ${className}`}>
      <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden>
        <rect x="1" y="1" width="18" height="18" rx="5" fill="currentColor" />
        <path d="M6 10h8M10 6v8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      benefixe
    </span>
  );
}
