import Link from "next/link";

/** Section shell: a noun-phrase heading, an optional action on the right, then content. */
export function Section({ id, title, action, children, className = "" }: {
  id?: string; title: string; action?: { href: string; label: string }; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24 ${className}`}>
      <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
        <h2 className="h-display text-3xl sm:text-[2.6rem]">{title}</h2>
        {action && <Link href={action.href} className="shrink-0 text-[13px] font-medium text-ink-2 hover:text-ink">{action.label} →</Link>}
      </div>
      {children}
    </section>
  );
}

export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className={`grid gap-x-8 gap-y-10 sm:grid-cols-2 ${steps.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {steps.map((s, i) => (
        <li key={s.title} className="border-t border-ink pt-5">
          <span className="font-mono text-[12px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
          <h3 className="mt-3 text-lg font-medium tracking-[-0.01em]">{s.title}</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 16 16" className={`mt-[3px] size-3.5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 8.5l3 3 7-7" /></svg>;
}
