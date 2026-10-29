import Link from "next/link";
import { MARKETS, mpath, type MarketKey } from "@/lib/market";
import type { Guide } from "@/lib/blog-api";
import { SERVICES } from "@/lib/services";
import { CoverArt } from "@/components/cover-art";
import { Terrain } from "@/components/terrain";
import { ChatMock, ClaimReportMock, CoverListMock, ReportMock, UploadMock } from "./ui-mocks";
import { CoverChecker, HeroEmail } from "./home-client";
import { COVER_GROUPS } from "@/lib/quote";
import { COVER_GUIDES, DISCLOSURE } from "@/lib/cover-tags";

/** Hero (Fernstone layout, flex.one email form): headline, one line, three ticks, work email → policy review, the report window below. */
export function HomeHero({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  const points = ["Policy review against your contracts", "Cover quotes from several insurers", "Adviser chat on any clause"];
  return (
    <Terrain shade="evergreen">
    <section className="fh" aria-labelledby="hero-h">
      <h1 id="hero-h" className="fh-h1">Get your policy reviewed</h1>
      <p className="fh-lede">Advisers read your policy against your contracts and lease, then explain the gaps, the overlaps and the price.</p>
      <ul className="fh-points">{points.map(p => <li key={p}>{p}</li>)}</ul>
      <HeroEmail m={m} />
      <p className="fh-alt">or <Link href={mpath(m, SERVICES.quotes.path)}>{SERVICES.quotes.cta.toLowerCase()}</Link></p>
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
          <Link href={mpath(m, SERVICES.claim.path)} className="btn btn-primary mt-8 self-center">{SERVICES.claim.cta}</Link>
        </div>
        <Link href={mpath(m, SERVICES.claim.path)} className="cf-art grain grain-evergreen" aria-label="Example claim second opinion report">
          <span className="cf-sheet" aria-hidden><ClaimReportMock currency={MARKETS[m].currency} body={MARKETS[m].disputeBody} /></span>
        </Link>
      </div>
    </section>
  );
}

const CARDS = [
  { key: "ask", tone: "grain-evergreen", title: SERVICES.chat.name, text: "Ask about a cover, an exclusion or a contract clause. Each answer names the section it comes from.", cta: SERVICES.chat.cta, path: SERVICES.chat.path },
  { key: "review", tone: "grain-moss", title: SERVICES.review.name, text: "Send the schedule and wording. An adviser checks each cover against your contracts and premises.", cta: SERVICES.review.cta, path: SERVICES.review.path },
  { key: "choose", tone: "grain-pine", title: SERVICES.quotes.name, text: "Pick your business type. We show the cover it usually holds, and an adviser gets quotes from insurers.", cta: SERVICES.quotes.cta, path: SERVICES.quotes.path },
] as const;

/** Three services (Harvey "One Platform" cards): the hovered card widens, the others fade. */
export function ServiceCards({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  return (
    <section className="hp-sec" aria-labelledby="svc-h">
      <div className="wrap text-center">
        <h2 id="svc-h" className="hp-h2">Services</h2>
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
        <Disclosure />
      </div>
    </section>
  );
}

/** One line, beside the services it qualifies (flex.one "not a bank" line). */
export function Disclosure() {
  return <p className="disc">{DISCLOSURE}</p>;
}

/** How Corp Cover is paid (flex.one statement band): one sentence, one paragraph. */
export function Statement() {
  return (
    <section className="st grain grain-evergreen" aria-labelledby="st-h">
      <div className="wrap st-in">
        <h2 id="st-h" className="st-h2">Insurers pay the broker. A review or a quote costs your business nothing.</h2>
        <p className="st-p">Corp Cover reads the policy, explains the wording and passes your request to a licensed broker. The broker compares insurers, places the cover and is paid commission by the insurer. The claim review is the one paid service: a flat fee, never a share of the payout.</p>
      </div>
    </section>
  );
}

/** Cover checker section (flex.one availability selector). */
export function CoverCheck({ m }: { m: MarketKey }) {
  return (
    <section className="wrap hp-sec" aria-labelledby="ck-h">
      <h2 id="ck-h" className="hp-h2 !text-left">Cover by business type</h2>
      <CoverChecker m={m} />
    </section>
  );
}

/** Liability and asset cover (flex.one product list): the hovered row sharpens, the rest fade. */
export function CoverLines({ m, slugs }: { m: MarketKey; slugs: string[] }) {
  return (
    <section className="cl grain grain-moss" aria-labelledby="cl-h">
      <div className="wrap cl-in">
        <h2 id="cl-h" className="cl-h2">Liability and asset cover</h2>
        <div className="cl-cols">
          {COVER_GROUPS.filter(g => g.name !== "Other").map(g => (
            <div key={g.name}>
              <p className="cl-g">{g.name}</p>
              <ul className="cl-list">
                {g.items.map(c => {
                  const slug = COVER_GUIDES[c], guide = slug && slugs.includes(slug);
                  return (
                    <li key={c}>
                      <Link href={guide ? mpath(m, `/articles/${slug}`) : mpath(m, SERVICES.quotes.path)}>
                        <span>{c}</span><em>{guide ? "Guide" : SERVICES.quotes.cta}</em>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Situations (flex.one audience blocks): the trigger a business arrives with, routed to one service. */
export function Situations({ m, slugs }: { m: MarketKey; slugs: string[] }) {
  const fw = m === "sg" && slugs.includes("foreign-worker-insurance");
  const rows: { title: string; text: string; cta: string; href: string; tone: string }[] = [
    { title: "Signing a lease", text: "Leases name the cover and limits a tenant must hold. Send the lease clause with your policy. An adviser checks they match.", cta: SERVICES.review.cta, href: mpath(m, SERVICES.review.path), tone: "grain-evergreen" },
    { title: "Tendering for a contract", text: "Tenders list the cover required before award. Send the tender clause. A broker quotes against it.", cta: SERVICES.quotes.cta, href: mpath(m, SERVICES.quotes.path), tone: "grain-moss" },
    fw
      ? { title: "Hiring foreign workers", text: "Most work permit holders need medical insurance, a security bond and work injury cover before they start.", cta: "Read the guide", href: mpath(m, "/articles/foreign-worker-insurance"), tone: "grain-pine" }
      : { title: "Hiring staff", text: "Most employers must insure staff for work injury. A broker quotes for your headcount.", cta: SERVICES.quotes.cta, href: mpath(m, SERVICES.quotes.path), tone: "grain-pine" },
    { title: "Renewal due", text: "Send the renewal notice before you pay. An adviser compares it with last year's schedule.", cta: SERVICES.review.cta, href: mpath(m, SERVICES.review.path), tone: "grain-moss" },
    { title: "Claim rejected", text: "Send the insurer's letter and the policy. Each reason is set against the clause it relies on.", cta: SERVICES.claim.cta, href: mpath(m, SERVICES.claim.path), tone: "grain-evergreen" },
  ];
  return (
    <section className="wrap hp-sec" aria-labelledby="si-h">
      <h2 id="si-h" className="hp-h2 !text-left">By situation</h2>
      <div className="si-grid">
        {rows.map(r => (
          <Link key={r.title} href={r.href} className={`si-card grain ${r.tone}`}>
            <span className="si-h3">{r.title}</span>
            <span className="si-text">{r.text}</span>
            <span className="pc-btn si-btn">{r.cta}</span>
          </Link>
        ))}
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
