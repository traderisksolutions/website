"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Arrow } from "./ui";

// Rillet "Aura" layout: numbered label, statement headline and lede on a dark band; a sticky topic list
// on the left tracks four stacked panels on the right, each a heading, a line, a link and a framed mock.

type Panel = { key: string; label: string; title: string; body: string; href: string; photo: string; mock: ReactNode };

function Illustrative() {
  return <span className="absolute right-3 top-3 rounded-sm bg-[var(--stone)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--muted)]">Illustrative</span>;
}

function FileMock() {
  const rows: [string, "done" | "open"][] = [
    ["Schedule of values, reinstatement basis", "done"],
    ["Loss runs, five years, with development", "done"],
    ["Gross profit calculation, audited", "done"],
    ["Survey report and recommendation status", "open"],
    ["Contract extracts: insurance clauses", "done"],
  ];
  return (
    <div className="relative w-full max-w-[560px] bg-white p-6 text-ink shadow-[0_24px_60px_-20px_rgba(15,30,58,.45)]">
      <Illustrative />
      <p className="text-[12px] uppercase tracking-wider text-[var(--muted)]">Underwriting file · Property and BI</p>
      <p className="mt-1 text-[18px] font-medium">Renewal 1 April · 4 of 5 complete</p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-sm bg-[var(--stone)]"><div className="h-full w-4/5 bg-[var(--ultra)]" /></div>
      <ul className="mt-5 divide-y divide-[var(--rule-strong)] border-t border-[var(--rule-strong)] text-[14px]">
        {rows.map(([t, s]) => (
          <li key={t} className="flex items-center justify-between gap-4 py-2.5">
            <span>{t}</span>
            <span className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] ${s === "done" ? "bg-[var(--ultra-tint)] text-[var(--ultra)]" : "bg-[var(--stone)] text-[var(--bronze)]"}`}>{s === "done" ? "Received" : "Requested"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarketMock() {
  const cols = ["Insurer A", "Insurer B", "Insurer C"];
  const rows = [
    ["Limit", "HKD 200m", "HKD 200m", "HKD 150m"],
    ["Retention", "HKD 1m", "HKD 2.5m", "HKD 1m"],
    ["Side A DIC", "Included", "Excluded", "Included"],
    ["IvI carve-back", "Liquidators", "None", "Liquidators, shareholders"],
    ["Subjectivities", "1 open", "3 open", "None"],
  ];
  return (
    <div className="relative w-full max-w-[600px] bg-white p-6 text-ink shadow-[0_24px_60px_-20px_rgba(15,30,58,.45)]">
      <Illustrative />
      <p className="text-[12px] uppercase tracking-wider text-[var(--muted)]">Market comparison · D&amp;O primary</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[440px] text-left text-[13px]">
          <thead><tr className="border-b border-[var(--rule-strong)] text-[var(--muted)]"><th className="py-2 font-normal">Term</th>{cols.map(c => <th key={c} className="py-2 font-normal">{c}</th>)}</tr></thead>
          <tbody className="tabular-nums">
            {rows.map(r => (
              <tr key={r[0]} className="border-b border-[var(--rule-strong)] last:border-0">
                <td className="py-2.5 text-[var(--muted)]">{r[0]}</td>
                {r.slice(1).map((v, i) => <td key={i} className={`py-2.5 ${i === 2 && r[0] !== "Limit" ? "font-medium text-[var(--ultra)]" : ""}`}>{v}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WordingMock() {
  return (
    <div className="relative w-full max-w-[560px] bg-white p-6 text-ink shadow-[0_24px_60px_-20px_rgba(15,30,58,.45)]">
      <Illustrative />
      <p className="text-[12px] uppercase tracking-wider text-[var(--muted)]">Wording mark-up · Exclusion 4.2</p>
      <p className="mt-4 text-[15px] leading-relaxed">
        The Insurer shall not be liable for any Claim brought by or on behalf of any Insured
        <span className="bg-[var(--ultra-tint)] text-[var(--ultra)]">, except a Claim brought by a liquidator, receiver or administrator of the Company, or a derivative action by shareholders without the solicitation of any Insured Person</span>
        <span className="text-[var(--muted)] line-through decoration-[var(--bronze)]"> in any capacity whatsoever</span>.
      </p>
      <div className="mt-5 flex items-center gap-3 border-t border-[var(--rule-strong)] pt-4 text-[13px]">
        <span className="rounded-sm bg-[var(--ultra-tint)] px-2 py-0.5 text-[var(--ultra)]">Agreed by insurer</span>
        <span className="text-[var(--muted)]">Endorsement 7 · before inception</span>
      </div>
    </div>
  );
}

function ClaimMock() {
  const steps: [string, string, boolean][] = [
    ["Day 0", "Notified within policy conditions", true],
    ["Day 2", "Coverage position issued in writing", true],
    ["Day 9", "Loss adjuster appointed, scope agreed", true],
    ["Day 30", "Interim payment requested", true],
    ["Day 74", "Quantum agreed, settlement", false],
  ];
  return (
    <div className="relative w-full max-w-[520px] bg-white p-6 text-ink shadow-[0_24px_60px_-20px_rgba(15,30,58,.45)]">
      <Illustrative />
      <p className="text-[12px] uppercase tracking-wider text-[var(--muted)]">Claim file · Material damage and BI</p>
      <ol className="mt-5 grid gap-0">
        {steps.map(([d, t, done], i) => (
          <li key={d} className="relative flex gap-4 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-[var(--rule-strong)]" aria-hidden />}
            <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-sm border-2 ${done ? "border-[var(--ultra)] bg-[var(--ultra)]" : "border-bronze bg-white"}`} aria-hidden />
            <div className="flex flex-1 items-baseline justify-between gap-4 text-[14px]">
              <span>{t}</span><span className="shrink-0 tabular-nums text-[var(--muted)]">{d}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const PANELS: Panel[] = [
  { key: "submission", label: "Submission", title: "An underwriting file, not a proposal form.", body: "SOVs on a reinstatement basis, loss runs with development, contract extracts and risk improvements, presented before the underwriter asks. Gaps are priced as uncertainty, so we close them first.", href: "/how-we-work", photo: "industrial", mock: <FileMock /> },
  { key: "marketing", label: "Marketing", title: "Selected markets. Terms compared clause by clause.", body: "Each risk goes to the insurers with appetite and capacity for it. Quotes are compared on limit, retention, sublimits, exclusions and subjectivities, not premium alone.", href: "/how-we-work", photo: "harbour", mock: <MarketMock /> },
  { key: "wording", label: "Wording", title: "Wordings negotiated before bind.", body: "Insured-versus-insured carve-backs, dedicated Side A, retroactive dates, LEG 3, waiting periods. We mark up the form and close subjectivities before inception.", href: "/coverage/directors-officers", photo: "night", mock: <WordingMock /> },
  { key: "claims", label: "Claims", title: "Claims advocacy from first notice.", body: "Notification within policy conditions, a coverage position in writing, quantum prepared to the policy basis, and settlement negotiated with the adjuster.", href: "/claims", photo: "construction", mock: <ClaimMock /> },
];

export function FileSection() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-40% 0px -55% 0px" });
    refs.current.forEach(r => r && io.observe(r));
    return () => io.disconnect();
  }, []);

  return (
    <section className="bg-stone text-ink">
      <div className="wrap section">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className="eyebrow">/ 03 · The file</p>
          <h2 className="display h2 text-ink">We carry the file. <span className="text-ultra">You keep the decision.</span></h2>
          <p className="lede">Submission, market approach, wording negotiation and claims advocacy, run by one named team. Recommendations are made in writing; every bind decision stays with the insured.</p>
        </div>

        <div className="mt-16 grid gap-10 lg:mt-24 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
          <nav aria-label="The file" className="hidden lg:block">
            <ol className="sticky top-32 grid gap-3">
              {PANELS.map((p, i) => (
                <li key={p.key}>
                  <a href={`#file-${p.key}`} className={`flex items-center gap-2 font-mono text-[12.5px] uppercase tracking-[0.1em] transition-colors ${i === active ? "text-ultra" : "text-muted hover:text-ink-2"}`}>
                    <span className={`size-1.5 rounded-sm bg-ultra transition-opacity ${i === active ? "opacity-100" : "opacity-0"}`} aria-hidden />{p.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="flex min-w-0 flex-col gap-24 lg:gap-32">
            {PANELS.map((p, i) => (
              <article key={p.key} id={`file-${p.key}`} data-i={i} ref={el => { refs.current[i] = el; }} className="flex scroll-mt-28 flex-col gap-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
                  <div className="flex max-w-2xl flex-col gap-3">
                    <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-ultra lg:hidden">{p.label}</p>
                    <h3 className="display h3 text-ink">{p.title}</h3>
                    <p className="text-[16px] leading-relaxed text-muted">{p.body}</p>
                  </div>
                  <Link href={p.href} className="btn btn-ghost shrink-0 self-start md:self-end">Detail<Arrow /></Link>
                </div>
                <div className="relative grid min-h-[380px] place-items-center overflow-hidden px-4 py-10 md:min-h-[460px] md:px-10">
                  <Image src={`/images/${p.photo}.jpg`} alt="" fill sizes="(min-width: 1024px) 960px, 100vw" className="object-cover" />
                  <div className="absolute inset-0 bg-night/40" aria-hidden />
                  <div className="relative flex w-full justify-center">{p.mock}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
