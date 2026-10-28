import Image from "next/image";
import Link from "next/link";
import { CloseBand } from "@/components/close-band";
import { FileSection } from "@/components/file-section";
import { Accent, Arrow, ButtonLink, Eyebrow, Faq, NumberCells, SplitHead } from "@/components/ui";
import { FAMILIES, LINES } from "@/content/coverage";
import { INDUSTRIES } from "@/content/industries";
import { PLACEMENT } from "@/content/process";
import { site } from "@/site";

// Design (24 Oct 2026): privatebank.jpmorgan.com/apac for the hero and type (serif headings, sans body);
// hedgespecialty.com for the cell grids, ticker and off-white bands.
// Story order: rillet.com (promise, proof, product, operating model, objections, voice, close).

const DIFFERENCE = [
  { title: "Named brokers on every file.", body: "A broker, an account handler and a claims contact per client. The same three people at inception, mid-term and renewal.", tag: "Dedicated" },
  { title: "First read in [x] days. Firm terms when the file is ready.", body: "An indication on appetite and structure within [x] working days of a complete file. Firm terms once subjectivities are known.", tag: "Fast" },
  { title: "The risks others decline.", body: "Cat-exposed property, regulated financial firms, cyber after an incident, US products exposure, large contract works.", tag: "Hard risks" },
];

const FAQS = [
  { q: "How is remuneration disclosed?", a: "Brokerage by line and by insurer, and any fee, in writing before binding. Contingent commissions, if any, are disclosed in the client agreement." },
  { q: "Can you act mid-term under a broker of record letter?", a: "Yes. A broker of record letter moves servicing and open claims to us mid-term, subject to the insurer's acceptance. Cover and premium are unchanged until renewal." },
  { q: "Do you take over open claims?", a: "Yes, under the same letter. We review the notification, the coverage position and the quantum to date, then take over correspondence with the insurer and the adjuster." },
  { q: "How early should the renewal start?", a: "120 days for property and casualty, 150 for D&O and other financial lines. Late files reach fewer markets and leave subjectivities open at inception." },
];

export default function Home() {
  const lines = FAMILIES.flatMap(f => LINES.filter(l => l.family === f));
  return (
    <>
      {/* Hero: serif headline in white over the photograph, lede and actions at the foot (privatebank.jpmorgan.com). */}
      <section className="hero relative isolate flex min-h-[680px] flex-col justify-between text-white md:min-h-[800px] xl:min-h-[880px]">
        <Image src="/images/hero.jpg" alt="Victoria Harbour skyline" fill priority sizes="100vw" className="-z-20 object-cover" />
        <div className="hero-shade absolute inset-0 -z-10" aria-hidden />
        <div className="wrap reveal pt-14 lg:pt-20">
          <p className="eyebrow !text-white/75">{site.name} · Specialty and commercial lines</p>
          <h1 className="display h1 mt-6 max-w-[14ch] text-white">Hard-to-place risks, <em className="font-normal italic text-white/90">placed on the wording.</em></h1>
        </div>
        <div className="wrap pb-14 lg:pb-20">
          <div className="flex flex-col gap-8 border-t border-white/25 pt-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-2xl flex-col gap-7">
              <p className="text-[17px] leading-relaxed text-white/85">Curated market approaches, manuscript wordings where the standard form falls short, and claims advocacy from first notice. One named team from submission to settlement.</p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/contact#review" variant="on-dark">Request a programme review</ButtonLink>
                <ButtonLink href="/coverage" variant="ghost-dark">Lines we place</ButtonLink>
              </div>
            </div>
            <p className="text-[12px] uppercase tracking-[0.12em] text-white/70">Insurance Authority · {site.licence}</p>
          </div>
        </div>
      </section>

      {/* 01 The difference */}
      <section className="wrap section flex flex-col gap-14">
        <SplitHead num="01" label="The difference" title={<>Named brokers on <Accent>the hard files.</Accent></>} lede="Three commitments, for the companies we act for and the insurers we place with." />
        <NumberCells items={DIFFERENCE} />
      </section>

      {/* 02 How it works */}
      <section className="wrap section !pt-0 flex flex-col gap-14">
        <SplitHead num="02" label="How it works" title={<>From the renewal file <Accent>to the right market.</Accent></>} lede="Five stages on every renewal. The same named team stays with the account from review to claim." />
        <ol className="cells grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
          {PLACEMENT.map((s, i) => (
            <li key={s.title} className="flex flex-col pt-6">
              <p className="font-mono text-[12px] uppercase tracking-[0.04em] text-muted"><span className="text-ultra">{String(i + 1).padStart(2, "0")}</span> / {s.title}</p>
              <h3 className="display mt-6 text-[24px] text-ink">{s.headline}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.points[0]}.</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 03 The file (Rillet Aura layout) */}
      <FileSection />

      {/* 04 Coverage: Hedge cell grid */}
      <section className="bg-stone">
        <div className="wrap section flex flex-col gap-14">
          <div className="flex flex-col gap-6">
            <Eyebrow num="04">Coverage</Eyebrow>
            <h2 className="display h2 max-w-[22ch] text-ink">Placement knowledge <Accent>for difficult commercial risks.</Accent></h2>
            <p className="lede">Start with the line. Each guide sets out what the policy may cover, what moves price and terms, and the underwriting file we build.</p>
          </div>
          <div className="cells grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {lines.map(l => (
              <Link key={l.slug} href={`/coverage/${l.slug}`} className="group flex min-h-[200px] flex-col pt-6 transition-colors">
                <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-muted">{l.family}</span>
                <span className="display mt-3 text-[26px] text-ink">{l.name}</span>
                <span className="mt-auto flex items-center justify-between pt-10 text-[14px] text-muted group-hover:text-ultra">Coverage and preparation guide <Arrow /></span>
              </Link>
            ))}
            <Link href="/contact#review" className="group flex min-h-[220px] flex-col !bg-ultra p-7 text-white">
              <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-white/70">Programme review</span>
              <span className="display mt-3 text-[26px]">Send the renewal 120 days out.</span>
              <span className="mt-auto flex items-center justify-between pt-10 text-[14px] text-white/80">Request a review <Arrow /></span>
            </Link>
            <Link href="/coverage" className="group flex min-h-[220px] flex-col !bg-night p-7 text-white">
              <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-white/60">Coverage library</span>
              <span className="display mt-3 text-[26px]">Browse all lines.</span>
              <span className="mt-auto flex items-center justify-between pt-10 text-[14px] text-white/70">Coverage, wordings and preparation <span aria-hidden>→</span></span>
            </Link>
          </div>
        </div>
      </section>

      {/* 05 Industries */}
      <section className="wrap section flex flex-col gap-14">
        <SplitHead num="05" label="Industries" title={<>Sectors where loss runs <Accent>understate the exposure.</Accent></>} />
        <div className="cells grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {INDUSTRIES.map(ind => (
            <Link key={ind.slug} href={`/industries/${ind.slug}`} className="group flex min-h-[180px] flex-col pt-6 transition-colors">
              <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-muted">{ind.exposures.length} named risks · {ind.programme.length} lines</span>
              <span className="display mt-3 text-[26px] text-ink">{ind.name}</span>
              <span className="mt-2 text-[15px] leading-relaxed text-muted">{ind.summary}</span>
              <span className="mt-auto flex items-center justify-between pt-8 text-[14px] text-muted group-hover:text-ultra">Sector programme <Arrow /></span>
            </Link>
          ))}
        </div>
      </section>

      {/* 06 Claims and licence */}
      <section className="wrap section !pt-0 flex flex-col gap-14">
        <SplitHead num="06" label="Claims and licence" title={<>The claim is where <Accent>the placement is tested.</Accent></>} lede="The broker who placed the risk stays on the claim: notification, coverage position, quantum and settlement, argued on the wording." />
        <div className="cells grid-cols-1 md:grid-cols-3">
          {[["Claims handled in [year]", "[—]"], ["Median days, notification to settlement", "[—]"], ["Settled as a share of amount claimed", "[—]"]].map(([l, v]) => (
            <div key={l} className="flex flex-col gap-6 pt-6">
              <span className="font-mono text-[12px] uppercase tracking-[0.06em] text-muted">{l}</span>
              <span className="display text-[64px] leading-none text-ink">{v}</span>
            </div>
          ))}
        </div>
        <div className="cells grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {[["Insurance Authority", `Licensed broker company · ${site.licence}`], ["Client monies", "Segregated client account under Cap. 41"], ["Professional indemnity", "[Insurer and limit]"], ["Membership", "[HKCIB or PIBA]"]].map(([t, d]) => (
            <div key={t} className="flex flex-col gap-2 pt-5">
              <span className="display text-[20px] text-ink">{t}</span>
              <span className="font-mono text-[12.5px] text-muted">{d}</span>
            </div>
          ))}
        </div>
        <div><ButtonLink href="/claims" variant="ghost">How claims are run</ButtonLink></div>
      </section>

      {/* 07 In their words */}
      <section className="bg-stone">
        <div className="wrap section grid gap-12 lg:grid-cols-12 lg:gap-0">
          <div className="flex flex-col gap-6 lg:col-span-3 lg:pr-10">
            <Eyebrow num="07">In their words</Eyebrow>
            <ol className="border-t border-ink">
              {[1, 2, 3].map(n => (
                <li key={n} className="flex items-center gap-5 border-b border-rule py-4">
                  <span className={`text-[22px] font-light ${n === 1 ? "text-ultra" : "text-muted"}`}>{String(n).padStart(2, "0")}</span>
                  <span className="flex flex-col"><span className="text-[14px] text-ink">[Title]</span><span className="font-mono text-[12px] text-muted">[Company type · sector]</span></span>
                </li>
              ))}
            </ol>
          </div>
          <figure className="flex flex-col gap-8 lg:col-span-9">
            <blockquote className="display text-[30px] leading-[1.12] text-ink md:text-[48px]">“[Client quote on a placement or claim.] <Accent tone="muted">[Second sentence with the outcome.]</Accent>”</blockquote>
            <figcaption className="flex flex-col text-[15px]"><span className="text-ink">[Title]</span><span className="text-muted">[Company type · size]</span></figcaption>
          </figure>
        </div>
      </section>

      {/* 08 Questions */}
      <section className="wrap section grid gap-10 lg:grid-cols-12 lg:gap-0">
        <Eyebrow num="08" className="pt-2 lg:col-span-3">Questions</Eyebrow>
        <div className="lg:col-span-9"><Faq items={FAQS} /></div>
      </section>

      <CloseBand />
    </>
  );
}
