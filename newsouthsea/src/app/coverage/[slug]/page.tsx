import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CloseBand } from "@/components/close-band";
import { ButtonLink, Eyebrow, Photo, RuleList, SplitHead } from "@/components/ui";
import { LINES, lineBySlug } from "@/content/coverage";

export const dynamicParams = false;
export const generateStaticParams = () => LINES.map(l => ({ slug: l.slug }));

export async function generateMetadata({ params }: PageProps<"/coverage/[slug]">): Promise<Metadata> {
  const line = lineBySlug((await params).slug);
  return line ? { title: `${line.name} insurance`, description: line.summary } : {};
}

export default async function LinePage({ params }: PageProps<"/coverage/[slug]">) {
  const line = lineBySlug((await params).slug);
  if (!line) notFound();
  const related = line.related.map(lineBySlug).filter(l => l !== undefined);

  return (
    <>
      {/* Hero: text left, photograph right */}
      <section className="border-b border-rule">
        <div className="wrap grid gap-10 py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:py-28">
          <div className="reveal flex flex-col gap-6">
            <Eyebrow><Link href="/coverage" className="hover:text-ink">Coverage</Link> / {line.family}</Eyebrow>
            <h1 className="display h1 text-ink">{line.name}</h1>
            <p className="text-[21px] font-medium leading-snug tracking-[-0.01em] text-ink md:text-[24px]">{line.thesis}</p>
            <p className="lede">{line.summary}</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <ButtonLink href="#review">Request a review of this cover</ButtonLink>
              <ButtonLink href="#file" variant="ghost">What we need from you</ButtonLink>
            </div>
          </div>
          <Photo src={line.image} alt={line.name} priority className="aspect-[4/3] w-full lg:aspect-auto lg:min-h-[460px]" />
        </div>
      </section>

      {/* 01 What the cover answers */}
      <section className="wrap section flex flex-col gap-12">
        <SplitHead num="01" label="Scope" title="What it may cover" lede="Subject to wording. Insurers differ; a sound policy answers these three points." />
        <div className="grid gap-4 md:grid-cols-3">
          {line.scope.map((s, i) => (
            <div key={s} className={`flex flex-col gap-6 p-7 ${i === 0 ? "bg-ultra text-white" : "card"}`}>
              <span className={`font-mono text-[13px] ${i === 0 ? "text-white/75" : "text-ultra"}`}>{String(i + 1).padStart(2, "0")}</span>
              <p className={`text-[17px] leading-snug ${i === 0 ? "text-white" : "text-ink"}`}>{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 02 What moves the price */}
      <section className="bg-stone">
        <div className="wrap section flex flex-col gap-12">
          <SplitHead num="02" label="Placement" title="What affects price and terms" lede="Underwriters price what they can see. These facts come first, so we present them before they ask." />
          <div className="cells sm:grid-cols-2">
            {line.factors.map(f => <p key={f} className="pt-6 text-[16px] leading-relaxed text-ink">{f}</p>)}
          </div>
        </div>
      </section>

      {/* 03 The underwriting file */}
      <section id="file" className="wrap section grid scroll-mt-20 gap-10 lg:grid-cols-[3fr_9fr] lg:gap-0">
        <Eyebrow num="03" className="pt-2">The underwriting file</Eyebrow>
        <div className="flex min-w-0 flex-col gap-8">
          <h2 className="display h2 text-ink">What we need from you</h2>
          <ul className="cells">
            {line.file.map(f => (
              <li key={f} className="flex items-start gap-4 pt-5">
                <svg viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-ultra" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="m3 8.5 3 3 7-7" /></svg>
                <span className="text-[16px] text-ink">{f}</span>
              </li>
            ))}
          </ul>
          <p className="body">A complete file reaches more markets and returns firmer terms. Gaps are priced as uncertainty.</p>
        </div>
      </section>

      {/* 04 What we see at renewal */}
      <section className="wrap section !pt-0 flex flex-col gap-10">
        <SplitHead num="04" label="At renewal" title="Common gaps at renewal" />
        <RuleList items={line.pitfalls} numbered />
      </section>

      {/* Related lines */}
      <section className="border-t border-rule">
        <div className="wrap section flex flex-col gap-8">
          <Eyebrow>Often placed with</Eyebrow>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map(r => (
              <Link key={r.slug} href={`/coverage/${r.slug}`} className="card group flex flex-col gap-3 p-7 transition-colors hover:border-bronze">
                <span className="eyebrow">{r.family}</span>
                <span className="display text-[26px] text-ink group-hover:text-umber">{r.name}</span>
                <span className="body">{r.thesis}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CloseBand />
    </>
  );
}
