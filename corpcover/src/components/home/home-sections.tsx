import Link from "next/link";
import { MARKETS, mpath, type MarketKey } from "@/lib/market";
import type { Guide } from "@/lib/blog-api";
import { SERVICES } from "@/lib/services";
import { CoverArt } from "@/components/cover-art";
import { ChatMock, ClaimReportMock, CoverListMock, ReportMock, UploadMock } from "./ui-mocks";

/** Hero (Cohere North): painted grass ground, copy bottom-left, product window bleeding right and bottom.
 *  Ground is code-drawn by scripts/paint-hero-grass.py. */
export function HomeHero({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  const points = [
    "Policy review against your contracts, leases and tenders",
    "Cover quotes from several insurers in one request",
    "Adviser chat on any clause in your wording",
  ];
  return (
    <section className="hh" aria-labelledby="hero-h">
      <div className="hh-copy">
        <p className="hh-badge">{m === "sg" ? "Singapore" : `${M.name} · Singapore headquartered`}</p>
        <h1 id="hero-h" className="hh-h1">Get the right insurance coverage</h1>
        <p className="hh-lede">Advisers compare plans across insurers and have saved businesses millions in premiums.</p>
        <ul className="hh-points">{points.map(p => <li key={p}>{p}</li>)}</ul>
        <div className="hh-ctas">
          <Link href={mpath(m, SERVICES.quotes.path)} className="hh-cta">{SERVICES.quotes.name}</Link>
          <Link href={mpath(m, SERVICES.review.path)} className="hh-link">{SERVICES.review.name}</Link>
        </div>
      </div>
      <div className="hh-media" aria-hidden>
        <div className="hh-win">
          <div className="hh-rail"><i className="on" /><i /><i /><i /><i /><b>A</b><b>N</b></div>
          <ReportMock currency={M.currency} />
        </div>
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
          <h2 id="claim-h" className="cf-h2">Unsure about your claim?</h2>
          <p className="cf-lede">Send your policy, supporting documents, and any legal documents or email threads with the insurer. We analyse what your policy entitles you to receive and advise you on the next step.</p>
          <p className="cf-get">What you get</p>
          <ul className="cf-ticks">
            <li><b>Detailed PDF report</b><span>An analysis of your claim: each reason the insurer gave, the clause it relies on, and what the wording supports.</span></li>
            <li><b>30-minute call with an experienced broker</b><span>A broker who did not sell you the policy goes through the report and your options with you.</span></li>
          </ul>
          <Link href={mpath(m, "/claims")} className="btn btn-primary mt-8 self-center">Check my claim</Link>
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
  { key: "choose", tone: "grain-pine", title: SERVICES.quotes.name, text: "Pick your business type. We show the cover it usually holds, and an adviser gets quotes from insurers.", cta: "Find my cover", path: "/get-covered" },
] as const;

/** Three services (Harvey "One Platform" cards): the hovered card widens, the others fade. */
export function ServiceCards({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  return (
    <section className="hp-sec" aria-labelledby="svc-h">
      <div className="wrap text-center">
        <h2 id="svc-h" className="hp-h2">Business insurance, start to finish</h2>
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
