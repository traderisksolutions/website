import Image from "next/image";
import Link from "next/link";
import { CloseBand } from "@/components/close-band";
import { LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { PLACEMENT } from "@/content/process";
import { site } from "@/site";

// Home: Hedge's story order. Hero = gic.com.sg navy panel on the harbour. Each section = statement, bold heading,
// two paragraphs (GIC), then cards (NSS tile). 01 = flex.one split (heading + ticks beside prose); 03 = flex.one open icon trio.
// Bands alternate white / grey. Coverage = harvey.ai bento tiles. Close = night harbour.

const STAGE_TAGS = ["~ 120 days out", "~ one file per line", "~ timing by file", "~ before inception", "~ same working day"];
const TICKS = [
  "One broker, one account handler and one claims contact per client, from inception through claim.",
  "First read within [x] working days of a complete file. Firm terms once subjectivities are known.",
  "Cat-exposed property, regulated financial firms, D&O with a going-concern note, cyber after an incident.",
];
const ICO = {
  live: <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 12 7 12 10 5 14 19 17 12 21 12" /></svg>,
  shared: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1.5a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5V20" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 13.6a5 5 0 0 1 3 4.6V20" /></svg>,
  closed: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h6l2 2h10v12H3z" /><polyline points="8.5 14 11 16.5 15.5 12" /></svg>,
};
// 03 The file: flex.one open trio (icon chip, serif heading, one paragraph).
const FILE = [
  { icon: ICO.live, t: "Live, not a status email.", p: "Market responses, open subjectivities and quotes land in one record as they arrive. The named people on the account, on the client side and ours, read the same file. No checking-in emails and no PDF ping-pong." },
  { icon: ICO.shared, t: "Everyone, same file.", p: "Finance, legal, the board pack and the insurer read from the file the broker works. When a subjectivity closes or an adjuster responds, the file updates and the people on it see it. Permissions by person, by line." },
  { icon: ICO.closed, t: "Clean binders, delivered.", p: "At bind the policy is checked against the quote and subjectivities are tracked through delivery. The file history stays with the account from one renewal to the next, so nothing is rebuilt from scratch." },
];
const WIDE = new Set(["property-business-interruption", "directors-officers"]);

function Head({ n, label, title, accent }: { n: string; label: string; title: string; accent: string }) {
  return <div className="head"><p className="eb"><span className="n">{n} {label}</span></p><h2 className="h2">{title} <span className="accent">{accent}</span></h2></div>;
}
function Card({ k, t, pts, tag }: { k: string; t: string; pts: string[]; tag?: string }) {
  return <div className="card"><p className="ct"><span className="k">{k}</span>{t}</p><ul>{pts.map(p => <li key={p}>{p}</li>)}</ul>{tag && <span className="tag">{tag}</span>}</div>;
}

export default function Home() {
  return (
    <>
      <section className="hero">
        <Image src="/images/hero.jpg" alt="Victoria Harbour skyline" fill priority sizes="100vw" className="bg" />
        <div className="shade" aria-hidden />
        <div className="wrap inner">
          <h1 className="caps-h1">A wholesale insurance brokerage for hard&#8209;to&#8209;place risks.</h1>
          <div className="side">
            <p className="lede">{site.name} makes specialty coverage easier to place. Structured intake and named broker support help retail agents prepare difficult commercial risks for current market review.</p>
            <div className="btns"><Link href="/contact" className="btn">Contact us <span className="arrow">↗</span></Link><Link href="/coverage" className="btn ghost">Lines we place</Link></div>
          </div>
        </div>
      </section>

      <section className="plain"><div className="wrap sec stack">
        <div className="head"><p className="eb"><span className="n">01 The difference</span></p></div>
        <div className="split">
          <div>
            <h2 className="sh">Named brokers on <span className="accent">the hard files.</span></h2>
            <ul className="ticks">{TICKS.map(t => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className="sp">
            <p>Most commercial programmes are renewed on last year&apos;s schedule by whoever picks up the file that month. The wording is rarely read against the contracts it is meant to answer. The gap shows at the claim, when the insurer reads it first.</p>
            <p>{site.name} works the other way round. A broker, an account handler and a claims contact are named at the first meeting and stay with the account through renewal and claim. Submissions are built as underwriting files, not forms. Markets are selected for the risk rather than circulated, and terms are compared clause by clause before any recommendation is made.</p>
          </div>
        </div>
      </div></section>

      <section className="band"><div className="wrap sec stack">
        <Head n="02" label="How it works" title="From the renewal file" accent="to the right market." />
        <div className="prose">
          <h3>A simpler path between the renewal file and the right market</h3>
          <p>Start with the renewal file, 120 days before inception for property and casualty and 150 for financial lines. No portal and no form to fill: send the current policies, the schedules and the loss runs you already hold. The named broker reads them against how the business operates today and tells you what the market will ask for before it asks.</p>
          <p>Every stage produces a document the client sees. The review lists gaps, overlaps and unnecessary cover. The underwriting file goes to market as it was shown to you. Terms come back compared line by line, not on premium alone. At bind the policy is checked against the quote before cover incepts. At claim the same broker argues the wording that was placed.</p>
        </div>
        <div className="cards c5">{PLACEMENT.map((s, i) => <Card key={s.title} k={`${String(i + 1).padStart(2, "0")} / ${s.title}`} t={s.headline} pts={s.points.slice(0, 2).map(p => `${p}.`)} tag={STAGE_TAGS[i]} />)}</div>
        <div className="btns" style={{ justifyContent: "flex-start" }}><Link href="/how-we-work" className="btn ghost">How it works, stage by stage</Link></div>
      </div></section>

      <section className="plain"><div className="wrap sec stack">
        <Head n="03" label="The file" title="One file per line," accent="from review through claim." />
        <div className="trio">
          {FILE.map(f => <div key={f.t}><span className="ico">{f.icon}</span><h3>{f.t}</h3><p>{f.p}</p></div>)}
        </div>
      </div></section>

      <section className="band"><div className="wrap sec stack">
        <Head n="04" label="Coverage" title="Placement knowledge" accent="for difficult commercial risks." />
        <div className="prose">
          <h3>Ten lines, four families, one preparation standard</h3>
          <p>Start with the line. Each coverage guide sets out what the policy may cover, what moves price and terms, the underwriting file we build before going to market, and the three mistakes we see most often at renewal. The guides are written for the reader who buys insurance for a living: the CFO, the risk manager, the general counsel.</p>
          <p>Where the standard form falls short, the wording is negotiated. A dedicated Side A limit on D&amp;O, an insured-versus-insured carve-back, contingency cargo cover where the buyer insures, an indemnity period sized to refit time rather than to the policy default. <Link href="/appetite" style={{ color: "var(--navy)" }}>Check appetite by class →</Link></p>
        </div>
        <div className="hgrid">
          {LINES.map(l => (
            <Link key={l.slug} href={`/coverage/${l.slug}`} className={`ht ${WIDE.has(l.slug) ? "wide" : ""}`}>
              <span className="chip">{l.family}</span><span className="htt">{l.name}</span><span className="hts">{l.summary}</span><span className="htq">{l.thesis}</span>
            </Link>
          ))}
        </div>
        <div className="btns" style={{ justifyContent: "flex-start" }}><Link href="/coverage" className="btn ghost">All coverage guides</Link></div>
      </div></section>

      <section className="plain"><div className="wrap sec stack">
        <Head n="05" label="Industries" title="Sectors where loss runs" accent="understate the exposure." />
        <div className="prose">
          <h3>Named risks per sector: the exposure, what it costs, the cover that answers it</h3>
          <p>A clean loss run is not evidence of a well-insured business. It is evidence that the large loss has not happened yet. Each sector page names the exposures that produce the large loss in that industry, states what it costs when it happens, and sets out the line and the wording that respond to it.</p>
          <p>The programme for each sector is built from the ten lines above, with the limits, extensions and carve-backs that sector needs: North American liability priced for a trading house, investigation costs on D&amp;O for a licensed firm, subcontracted labour under employees&apos; compensation for a contractor.</p>
        </div>
        <div className="cards c6">
          {INDUSTRIES.map(ind => (
            <Link key={ind.slug} href={`/industries/${ind.slug}`} className="card">
              <p className="ct"><span className="k">{ind.name}</span>{ind.headline}</p>
              <ul>{ind.exposures.slice(0, 3).map(e => <li key={e.title}>{e.response}</li>)}</ul>
              <span className="more">Sector programme →</span>
            </Link>
          ))}
        </div>
      </div></section>

      <section className="band"><div className="wrap sec stack">
        <div className="head" style={{ alignItems: "center" }}><p className="eb" style={{ justifyContent: "center" }}><span className="n">06 In their words</span></p></div>
        <figure className="quote"><blockquote>&ldquo;[Client quote on a placement or claim.] <span className="accent">[Second sentence with the outcome.]</span>&rdquo;</blockquote><figcaption><span>[Title]</span><span>[Company type · sector · size]</span></figcaption></figure>
      </div></section>

      <CloseBand />
    </>
  );
}
