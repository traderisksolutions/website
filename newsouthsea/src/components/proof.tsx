import type { ReactNode } from "react";
import { site } from "@/site";

/** Full-width ruled rows: label left, large serif figure right. Figures in brackets are for the client to supply. */
export function StatRows({ title, rows, dark = false }: { title: ReactNode; rows: { label: string; value: string }[]; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-10">
      <h2 className={`display h3 max-w-xl ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
      <dl className={`border-t ${dark ? "border-white/15" : "border-rule"}`}>
        {rows.map(r => (
          <div key={r.label} className={`grid items-baseline gap-2 border-b py-6 md:grid-cols-2 ${dark ? "border-white/15" : "border-rule"}`}>
            <dt className={`text-[15px] ${dark ? "text-white/65" : "text-ink-2"}`}>{r.label}</dt>
            <dd className={`display text-[44px] leading-none md:text-[64px] ${dark ? "text-white" : "text-ink"}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Regulatory and financial credentials, one ruled row each. */
export function Credentials() {
  const rows = [
    { name: "Insurance Authority", detail: `Licensed insurance broker company, licence ${site.licence}` },
    { name: "Client monies", detail: "Premiums held in a segregated client account, as the Insurance Ordinance (Cap. 41) requires" },
    { name: "Professional indemnity", detail: "[Insurer and limit of the firm's own PI policy]" },
    { name: "Industry membership", detail: "[Hong Kong Confederation of Insurance Brokers or PIBA membership]" },
  ];
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
      <div className="flex flex-col gap-5">
        <h2 className="display h2 text-ink">Licensed and regulated</h2>
        <p className="lede">New South Sea is licensed by the Insurance Authority and acts for the client, not the insurer.</p>
      </div>
      <ul className="border-t border-rule">
        {rows.map(r => (
          <li key={r.name} className="flex items-start gap-5 border-b border-rule py-5">
            <svg viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-ultra" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M10 2.5 3.5 5v5c0 3.6 2.8 6.6 6.5 7.5 3.7-.9 6.5-3.9 6.5-7.5V5L10 2.5Z" /><path d="m7 10 2 2 4-4" /></svg>
            <div className="min-w-0"><p className="text-[16px] font-semibold text-ink">{r.name}</p><p className="body mt-1">{r.detail}</p></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Placeholder quote until the client supplies an attributed one. */
export function QuoteBand() {
  return (
    <section className="bg-stone">
      <figure className="wrap section mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
        <blockquote className="display text-[28px] leading-snug text-ink md:text-[40px]">“[Client quote, two sentences at most, on a renewal or claim New South Sea handled.]”</blockquote>
        <figcaption className="flex flex-col gap-1 text-[14px]">
          <span className="font-semibold text-ink">[Name]</span>
          <span className="text-muted">[Title], [Company]</span>
        </figcaption>
      </figure>
    </section>
  );
}
