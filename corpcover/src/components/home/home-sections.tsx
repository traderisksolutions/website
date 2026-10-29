import Link from "next/link";
import { MARKETS, mpath, type MarketKey } from "@/lib/market";
import type { Guide } from "@/lib/blog-api";
import { SERVICES } from "@/lib/services";
import { CoverArt } from "@/components/cover-art";
import { Terrain } from "@/components/terrain";
import { ChatMock, ClaimReportMock, CoverListMock, ReportMock, UploadMock } from "./ui-mocks";

/** Hero (Fernstone): centred headline, one line on what Corp Cover is, three ticks, two actions, the report window below. */
export function HomeHero({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  const points = ["Policy review against your contracts", "Cover quotes from several insurers", "Adviser chat on any clause"];
  return (
    <Terrain shade="evergreen">
    <section className="fh" aria-labelledby="hero-h">
      <h1 id="hero-h" className="fh-h1">Get your policy reviewed</h1>
      <p className="fh-lede">Advisers read your policy against your contracts and lease, then explain the gaps, the overlaps and the price.</p>
      <ul className="fh-points">{points.map(p => <li key={p}>{p}</li>)}</ul>
      <div className="fh-ctas">
        <Link href={mpath(m, SERVICES.review.path)} className="btn btn-ghost">{SERVICES.review.name}</Link>
        <Link href={mpath(m, SERVICES.quotes.path)} className="btn btn-primary">{SERVICES.quotes.name}
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 12 12 4M5.5 4H12v6.5" /></svg>
        </Link>
      </div>
      <div className="fh-win" aria-hidden>
        <div className="fh-bar"><b><i>GP</i>GreenPoint Pte Ltd</b><span>Policy review · {M.name}</span></div>
        <ReportMock currency={M.currency} />
      </div>
    </section>
    </Terrain>
  );
}

/** By the numbers (Legora solution page): label left, three large figures with a line each. Figures supplied by Corp Cover. */
export function Numbers() {
  const stats: [string, string][] = [
    ["S$1M+", "Claims awarded to clients"],
    ["250+", "Clients served"],
    ["15%+", "Average saving on the previous policy"],
  ];
  return (
    <section className="nb" aria-labelledby="nb-h">
      <div className="wrap nb-grid">
        <h2 id="nb-h" className="nb-label">Corp Cover in numbers</h2>
        {stats.map(([n, l]) => <p key={l} className="nb-stat"><b>{n}</b><span>{l}</span></p>)}
      </div>
    </section>
  );
}

/** Claim second opinion (Harvey Tenet feature panel). */
export function ClaimFeature({ m }: { m: MarketKey }) {
  return (
    <section className="wrap hp-sec" aria-labelledby="claim-h">
      <div className="cf-panel">
        <div className="cf-copy">
          <p className="cf-eyebrow">50+ years of combined experience</p>
          <h2 id="claim-h" className="cf-h2">Get your claim reviewed</h2>
          <p className="cf-lede">Send the policy, the insurer&apos;s letters and your supporting documents. We set each reason the insurer gave against the clause it relies on, then advise on the next step.</p>
          <p className="cf-get">What you get</p>
          <ul className="cf-ticks">
            <li><b>PDF report</b><span>Each reason the insurer gave, the clause it relies on, and what the wording supports.</span></li>
            <li><b>30-minute call with a broker</b><span>A broker who did not sell you the policy goes through the report and your options with you.</span></li>
          </ul>
          <Link href={mpath(m, "/claims")} className="btn btn-primary mt-8 self-center">Send my claim for review</Link>
        </div>
        <Link href={mpath(m, "/claims")} className="cf-art grain grain-evergreen" aria-label="Example claim second opinion report">
          <span className="cf-sheet" aria-hidden><ClaimReportMock currency={MARKETS[m].currency} body={MARKETS[m].disputeBody} /></span>
        </Link>
      </div>
    </section>
  );
}

const CARDS = [
  { key: "ask", tone: "grain-evergreen", title: SERVICES.chat.name, text: "Ask about a cover, an exclusion or a contract clause. Each answer names the section it comes from.", cta: "Ask a question", path: "/ask" },
  { key: "review", tone: "grain-moss", title: SERVICES.review.name, text: "Send the schedule and wording. An adviser checks each cover against your contracts and premises.", cta: "Send my policy for review", path: "/policy-review" },
  { key: "choose", tone: "grain-pine", title: SERVICES.quotes.name, text: "Pick your business type. We show the cover it usually holds, and an adviser gets quotes from insurers.", cta: "Request quotes", path: "/get-covered" },
] as const;

/** Three services (Harvey "One Platform" cards): the hovered card widens, the others fade. */
export function ServiceCards({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  return (
    <section className="hp-sec" aria-labelledby="svc-h">
      <div className="wrap text-center">
        <h2 id="svc-h" className="hp-h2">Services</h2>
        <p className="hp-sub">Review the cover you hold, ask about a clause, or get quotes for new cover. Insurers pay the advisers; your business pays no fee.</p>
      </div>
      <div className="wrap">
        <div className="pc-row">
          {CARDS.map(({ key, tone, title, text, cta, path }) => (
            <Link key={key} href={mpath(m, path)} className={`pc-card grain ${tone}`}>
              <span className="pc-copy">
                <span className="pc-h3">{title}</span>
                <span className="pc-text">{text}</span>
                <span className="pc-btn">{cta}</span>
              </span>
              <span className="pc-ui" aria-hidden>{key === "ask" ? <ChatMock currency={M.currency} /> : key === "review" ? <UploadMock /> : <CoverListMock />}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Lenny's Newsletter treatment in Corp Cover greens: green ground, bold title, ink drawing, highlighter tag.
const GROUNDS: [string, string][] = [["#e3ece6", "#b9d8c3"], ["#d6e5db", "#c9e3b0"], ["#e9f0eb", "#a9cdb6"], ["#cfe0d4", "#d8ebc4"], ["#dde9e1", "#b5d6c0"]];
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Blogs (Harvey blog grid): typographic covers, title, date and topic. Five across, full rows only. */
export function BlogRail({ m, articles }: { m: MarketKey; articles: Guide[] }) {
  const n = articles.length >= 5 ? Math.min(10, Math.floor(articles.length / 5) * 5) : articles.length;
  if (!n) return null;
  return (
    <section className="hp-sec" aria-labelledby="blog-h">
      <div className="wrap">
        <div className="mb-10 flex items-end justify-between gap-6">
          <h2 id="blog-h" className="hp-h2 !text-left">Insights</h2>
          <Link href={mpath(m, "/articles")} className="text-[15px] text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">View all insights</Link>
        </div>
        <div className="hb-grid">
          {articles.slice(0, n).map((a, i) => {
            const [bg, mark] = GROUNDS[i % GROUNDS.length];
            return (
              <Link key={a.slug} href={mpath(m, `/articles/${a.slug}`)} className="hb-card group">
                <span className="hb-tile"><CoverArt article={a} bg={bg} mark={mark} /></span>
                <span className="hb-title">{a.title}</span>
                <span className="hb-meta">{fmt(a.updated ?? a.published)}<i aria-hidden>•</i>{a.topic}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
