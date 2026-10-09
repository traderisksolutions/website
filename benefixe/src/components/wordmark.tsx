export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display text-[1.35rem] font-bold leading-none tracking-[-0.03em] ${className}`}>
      benefixe<span className="text-accent">.</span>
    </span>
  );
}
