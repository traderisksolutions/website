import { faqs } from "@/content/faq";

/** Native <details> accordion: works without JavaScript and with the keyboard. */
export function FaqList() {
  return (
    <div className="divide-y divide-rule border-y border-rule">
      {faqs.map(f => (
        <details key={f.q} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[1.08rem] font-semibold leading-snug marker:hidden [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-rule text-ink-2 transition-transform group-open:rotate-45">
              <svg viewBox="0 0 12 12" className="size-3"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </span>
          </summary>
          <div className="max-w-[68ch] space-y-3 pb-6 pr-12 text-[0.98rem] leading-relaxed text-ink-2">
            {f.a.map((part, i) =>
              typeof part === "string"
                ? <p key={i}>{part}</p>
                : <ul key={i} className={`list-disc pl-5 marker:text-ink-3 ${part.length > 12 ? "columns-2 gap-8 sm:columns-3" : ""}`}>{part.map(x => <li key={x} className="break-inside-avoid py-0.5">{x}</li>)}</ul>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
