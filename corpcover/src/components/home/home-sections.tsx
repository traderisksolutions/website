import Link from "next/link";
import Image from "next/image";
import { MARKETS, mpath, type MarketKey } from "@/lib/market";
import type { Guide } from "@/lib/blog-api";
import { CoverArt } from "@/components/cover-art";
import { ChatMock, CoverListMock, ReportMock, UploadMock } from "./ui-mocks";
import secondOpinion from "../../../public/images/second-opinion.jpg";

/** Hero (Rillet solution page): tinted panel, copy left, product view right. Copy pattern from Chapter. */
export function HomeHero({ m }: { m: MarketKey }) {
  const M = MARKETS[m];
  return (
    <section className="hh" aria-labelledby="hero-h">
        <div className="hh-copy">
          <p className="hh-badge">{m === "sg" ? "Singapore" : `${M.name} · Singapore headquartered`}</p>
          <h1 id="hero-h" className="hh-h1">Get the <b>right</b> insurance <b>coverage</b></h1>
          <p className="hh-lede">Advisers compare plans across insurers and have saved businesses millions in premiums.</p>
          <div className="flex w-full flex-wrap gap-2.5">
            <Link href={mpath(m, "/ask")} className="btn btn-primary">Ask</Link>
            <Link href={mpath(m, "/policy-review")} className="btn btn-ghost">Review</Link>
            <Link href={mpath(m, "/get-covered")} className="btn btn-ghost">Choose</Link>
          </div>
          <p className="hh-trust"><span aria-hidden className="hh-dots"><i /><i /><i /></span>Trusted by 200+ businesses</p>
        </div>
        <div className="hh-media" aria-hidden><ReportMock currency={M.currency} /></div>
    </section>
  );
}

/** Claim second opinion (Harvey Tenet feature panel). */
export function ClaimFeature({ m }: { m: MarketKey }) {
  return (
    <section className="wrap hp-sec" aria-labelledby="claim-h">
      <div className="cf-panel">
        <div className="cf-copy">
          <p className="cf-eyebrow">Claim second opinion</p>
          <h2 id="claim-h" className="cf-h2">Unsure about your claim?</h2>
          <p className="cf-lede">We run your policy and the insurer&apos;s letter through an AI model set up to read policy wording and evidence. Then you get 30 minutes with an experienced B2B insurance broker.</p>
          <p className="cf-by">Our team has 50+ years of combined experience.</p>
          <Link href={mpath(m, "/claims")} className="btn btn-primary mt-7">Check my claim</Link>
        </div>
        <Link href={mpath(m, "/claims")} className="cf-art" aria-label="Claim second opinion">
          <Image src={secondOpinion} alt="A magnifying glass resting on a page of printed text" fill sizes="(min-width: 860px) 50vw, 100vw" placeholder="blur" className="object-cover" />
        </Link>
      </div>
    </section>
  );
}

const CARDS = [
  { key: "ask", tone: "grain-evergreen", title: "Ask", text: "Ask about a cover, an exclusion or a contract clause. Each answer names the section it comes from.", cta: "Ask a question", path: "/ask" },
  { key: "review", tone: "grain-olive", title: "Review", text: "Send the schedule and wording. An adviser checks each cover against your contracts and premises.", cta: "Send my policy for review", path: "/policy-review" },
  { key: "choose", tone: "grain-slate", title: "Choose", text: "Pick your business type. We show the cover it usually holds, and an adviser gets quotes from insurers.", cta: "Find my cover", path: "/get-covered" },
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

// Lenny's Newsletter treatment: warm ground, bold title, ink drawing, highlighter tag.
const GROUNDS: [string, string][] = [["#f8dcc4", "#f5b94a"], ["#dfe9e0", "#f5d36a"], ["#efe4cf", "#9fd0b4"], ["#f3d9d2", "#f5c46a"], ["#e2e6ef", "#f5b94a"]];
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Blogs (Harvey blog grid): typographic covers, title, date and topic. Five across, full rows only. */
export function BlogRail({ m, articles }: { m: MarketKey; articles: Guide[] }) {
  const n = articles.length >= 5 ? Math.min(10, Math.floor(articles.length / 5) * 5) : articles.length;
  if (!n) return null;
  return (
    <section className="hp-sec" aria-labelledby="blog-h">
      <div className="wrap">
        <div className="mb-10 flex items-end justify-between gap-6">
          <h2 id="blog-h" className="hp-h2 !text-left">Blogs</h2>
          <Link href={mpath(m, "/articles")} className="text-[15px] text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">View all blogs</Link>
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
