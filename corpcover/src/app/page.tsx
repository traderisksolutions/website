import Link from "next/link";
import { site, reviewHref } from "@/site";
import { articles, topics, formatDate } from "@/content/articles";
import { ArticleFeed } from "@/components/article-feed";
import { CoverTile } from "@/components/cover-tile";

type Basis = "Law" | "Lease" | "Contract" | "Recommended";

const policies: { name: string; pays: string; basis: Basis; slug: string }[] = [
  { name: "Work injury compensation", pays: "Medical costs, medical-leave wages and compensation for staff injured at work.", basis: "Law", slug: "work-injury-compensation" },
  { name: "Foreign worker medical and bonds", pays: "Inpatient care for Work Permit and S Pass holders; the S$5,000 bond per non-Malaysian Work Permit holder.", basis: "Law", slug: "foreign-worker-insurance" },
  { name: "Public liability", pays: "Third-party injury and property damage caused by your premises or your work.", basis: "Lease", slug: "public-liability" },
  { name: "Property and business interruption", pays: "Repair of premises, fit-out and stock, and profit lost while they are repaired.", basis: "Lease", slug: "property-and-business-interruption" },
  { name: "Professional indemnity", pays: "Claims that advice, design or service caused a client a financial loss.", basis: "Contract", slug: "professional-indemnity" },
  { name: "Directors and officers", pays: "Defence costs and settlements for directors sued personally.", basis: "Recommended", slug: "directors-and-officers" },
];

const basisLabel: Record<Basis, string> = {
  Law: "Required by law", Lease: "Required by lease", Contract: "Required by contract", Recommended: "Recommended",
};

function BasisPill({ basis }: { basis: Basis }) {
  const style =
    basis === "Law" ? "bg-accent text-accent-ink border-accent"
    : basis === "Recommended" ? "border-rule text-ink-3"
    : "border-ink-3 text-ink-2";
  return <span className={`inline-block shrink-0 self-start whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${style}`}>{basisLabel[basis]}</span>;
}

const steps = [
  { title: "Send what you hold", text: "Current policy schedules, headcount by role, leases and the insurance clauses in your main contracts." },
  { title: "Gap check", text: "Each policy is checked against the law, every lease and every contract. Missing cover and short limits are listed by policy." },
  { title: "Quotes compared", text: "Quotes from several insurers on the same terms, laid out line by line: limit, deductible, exclusions, premium." },
];

export default function Home() {
  const startHere = articles.slice(0, 4);

  return (
    <main className="flex-1">
      {/* ── Messaging ─────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pt-10 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pb-20">
        <div className="order-2 lg:order-1">
          <div className="rounded-xl bg-tile-sand p-5 sm:p-7">
            <p className="eyebrow !text-ink-2">Cover map · Singapore company with staff, premises and clients</p>
            <ul className="mt-5 divide-y divide-ink/10">
              {policies.map(p => (
                <li key={p.slug} className="flex items-center justify-between gap-4 py-3">
                  <span className="font-serif text-[1.1rem] leading-snug sm:text-[1.25rem]">{p.name}</span>
                  <BasisPill basis={p.basis} />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="order-1 text-center lg:order-2">
          <h1 className="font-serif text-[2.35rem] leading-[1.08] tracking-tight sm:text-[3.1rem]">
            Business insurance for Singapore companies
          </h1>
          <p className="mx-auto mt-5 max-w-[46ch] text-[1.08rem] leading-relaxed text-ink-2">
            What the law requires, what leases and contracts require, and what each policy pays. Plain guides, and a review of the cover you hold today.
          </p>
          <p className="eyebrow mt-5">{articles.length} guides · Updated {formatDate(articles[0].published)}</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <a href={reviewHref} className="rounded-md bg-accent px-5 py-3 font-medium text-accent-ink hover:opacity-90">Request a review</a>
            <Link href="#guides" className="font-medium text-ink underline decoration-rule decoration-2 underline-offset-4 hover:decoration-ink">Read the guides</Link>
          </div>
        </div>
      </section>

      <section id="policies" className="scroll-mt-4 border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <h2 className="text-xl font-semibold">Policies</h2>
          <ul className="mt-8 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
            {policies.map(p => (
              <li key={p.slug} className="flex flex-col">
                <BasisPill basis={p.basis} />
                <h3 className="mt-3 font-serif text-[1.4rem] leading-snug">{p.name}</h3>
                <p className="mt-2 flex-1 text-[0.97rem] leading-relaxed text-ink-2">{p.pays}</p>
                <Link href={`/articles/${p.slug}`} className="mt-3 text-sm font-medium text-accent hover:underline">Read the guide</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="review" className="scroll-mt-4 bg-accent-soft">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-xl font-semibold">Review process</h2>
            <a href={reviewHref} className="rounded-md border border-ink/20 bg-paper px-4 py-2 text-sm font-medium hover:border-ink">Request a review</a>
          </div>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="border-t border-ink/15 pt-5">
                <span className="font-serif text-3xl text-accent">{i + 1}</span>
                <h3 className="mt-2 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-[0.97rem] leading-relaxed text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Guides ───────────────────────────────────────────────── */}
      <section id="guides" className="scroll-mt-4 mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-b border-rule py-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold">Start here</h2>
            <Link href="/articles" className="eyebrow !text-ink hover:underline">View all</Link>
          </div>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-rule">
            {startHere.map(a => (
              <li key={a.slug} className="lg:px-5 lg:first:pl-0 lg:last:pr-0">
                <Link href={`/articles/${a.slug}`} className="group flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug group-hover:underline">{a.title}</p>
                    <p className="eyebrow mt-2">{a.topic}</p>
                  </div>
                  <CoverTile article={a} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-12">
          <div className="min-w-0">
            <h2 className="sr-only">Latest guides</h2>
            <ArticleFeed />
          </div>
          <aside id="about" className="scroll-mt-4 lg:border-l lg:border-rule lg:pl-10">
            <p className="font-serif text-2xl italic">{site.name}</p>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{site.description}</p>
            <a href={reviewHref} className="mt-5 inline-block rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent-soft">Request a review</a>
            <h3 className="mt-10 border-b border-rule pb-2 font-semibold">Topics</h3>
            <ul className="mt-3 space-y-2.5">
              {topics.map(t => (
                <li key={t} className="flex justify-between text-[0.95rem]">
                  <span>{t}</span>
                  <span className="tabular-nums text-ink-3">{articles.filter(a => a.topic === t).length}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
