import Link from "next/link";

/** Section shell: a noun-phrase heading, an optional action on the right, then content. */
export function Section({ id, title, action, children, className = "" }: {
  id?: string; title: string; action?: { href: string; label: string }; children: React.ReactNode; className?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 ${className}`}>
      <div className="mb-8 flex items-end justify-between gap-4 sm:mb-10">
        <h2 className="font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.6rem]">{title}</h2>
        {action && <Link href={action.href} className="shrink-0 text-[15px] font-medium text-ink-2 hover:text-ink">{action.label} →</Link>}
      </div>
      {children}
    </section>
  );
}

export function Steps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className={`grid gap-4 sm:grid-cols-2 ${steps.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {steps.map((s, i) => (
        <li key={s.title} className="rounded-3xl bg-cream p-6">
          <span className="grid size-10 place-items-center rounded-full bg-ink font-display text-lg font-bold text-white">{i + 1}</span>
          <h3 className="mt-5 text-xl font-semibold">{s.title}</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
