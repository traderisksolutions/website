export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-rule border-y border-rule">
      {items.map(f => (
        <details key={f.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-track text-xl leading-none transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
