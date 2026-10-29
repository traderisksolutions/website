import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/site";

/* Inner-page blocks on the juliusbaer.com bespoke-lending layout: centred tracked title and lede, one reading column,
   light sub-headings, plain columns, numbered stage rows, a centred trio, a beige band close. */

export function JbHead({ crumbs, title, lede }: { crumbs: { label: string; href?: string }[]; title: string; lede: ReactNode }) {
  return (
    <div className="jb-head">
      <p className="crumb">{crumbs.map((c, i) => <span key={c.label}>{i > 0 && " · "}{c.href ? <Link href={c.href}>{c.label}</Link> : c.label}</span>)}</p>
      <h1 className="jb-h1">{title}</h1>
      <p className="jb-lede">{lede}</p>
    </div>
  );
}

export const JbCol = ({ children }: { children: ReactNode }) => <div className="jb-col">{children}</div>;
export const JbP = ({ children }: { children: ReactNode }) => <p className="jb-p">{children}</p>;
export const JbH2 = ({ id, children }: { id?: string; children: ReactNode }) => <h2 id={id} className="jb-h2">{children}</h2>;
export const JbNote = ({ children }: { children: ReactNode }) => <p className="jb-note">{children}</p>;

export function JbTrio({ items, cols = 3 }: { items: { title: ReactNode; body: ReactNode; response?: ReactNode }[]; cols?: 2 | 3 }) {
  return (
    <div className={`jb-trio c${cols}`}>
      {items.map((it, i) => <div key={i} className="jb-item"><h4>{it.title}</h4><p>{it.body}</p>{it.response && <p className="jb-resp">{it.response}</p>}</div>)}
    </div>
  );
}

export function JbLinks({ rows }: { rows: { title: string; sub: string; href: string }[] }) {
  return <ul className="jb-links">{rows.map(r => <li key={r.href + r.title}><Link href={r.href}><span>{r.title}</span><span className="jb-sub">{r.sub}</span></Link></li>)}</ul>;
}

export function JbStages({ stages }: { stages: { title: string; headline: string; body: string; points: string[] }[] }) {
  return (
    <>
      {stages.map((s, i) => (
        <div key={s.title} className="jb-stage">
          <span className="jb-num">{String(i + 1).padStart(2, "0")}</span>
          <div><p className="jb-stage-t">{s.title}</p><h3 className="jb-h3">{s.headline}</h3><p className="jb-p">{s.body}</p><p className="jb-pts">{s.points.join(" · ")}.</p></div>
        </div>
      ))}
    </>
  );
}

export function JbApart({ label, items, id }: { label: string; items: { title: string; body: ReactNode }[]; id?: string }) {
  return (
    <section id={id} className="jb-apart">
      <p className="jb-label">{label}</p>
      <div className="jb-trio c3">{items.map(it => <div key={it.title} className="jb-item"><h4>{it.title}</h4><p>{it.body}</p></div>)}</div>
    </section>
  );
}

export function JbCta({ title, line }: { title: ReactNode; line?: string }) {
  return (
    <section className="jb-cta">
      <h2 className="jb-cta-h">{title}</h2>
      <Link href="/contact?purpose=review" className="btn">Request a programme review</Link>
      {line !== undefined && <p className="jb-line">{line || `${site.email} · ${site.hours}`}</p>}
    </section>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return <div className="faq">{items.map(f => <details key={f.q}><summary>{f.q}</summary><p className="body">{f.a}</p></details>)}</div>;
}

/* flex.one/global-banking section shape: content left, one sticky photo right (desktop only). */
export function JbSplit({ image, alt, children }: { image: string; alt: string; children: ReactNode }) {
  return (
    <div className="jb-split">
      <div className="jb-split-main">{children}</div>
      <div className="jb-split-media" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/images/${image}.jpg`} alt={alt} loading="lazy" decoding="async" />
      </div>
    </div>
  );
}

export function JbTicks({ items }: { items: ReactNode[] }) {
  return (
    <ul className="jb-ticks">
      {items.map((it, i) => (
        <li key={i}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function JbStack({ items }: { items: { title: ReactNode; body: ReactNode; response?: ReactNode }[] }) {
  return (
    <div className="jb-stack">
      {items.map((it, i) => <div key={i} className="jb-stack-item"><h3>{it.title}</h3><p>{it.body}</p>{it.response && <p className="jb-resp">{it.response}</p>}</div>)}
    </div>
  );
}
