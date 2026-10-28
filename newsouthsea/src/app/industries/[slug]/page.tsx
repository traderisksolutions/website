import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CloseBand } from "@/components/close-band";
import { QuoteBand } from "@/components/proof";
import { ButtonLink, Eyebrow, Faq, Photo, SplitHead } from "@/components/ui";
import { lineBySlug } from "@/content/coverage";
import { INDUSTRIES, industryBySlug } from "@/content/industries";
import { PLACEMENT } from "@/content/process";

export const dynamicParams = false;
export const generateStaticParams = () => INDUSTRIES.map(i => ({ slug: i.slug }));

export async function generateMetadata({ params }: PageProps<"/industries/[slug]">): Promise<Metadata> {
  const ind = industryBySlug((await params).slug);
  return ind ? { title: `Insurance for ${ind.name.toLowerCase()}`, description: ind.summary } : {};
}

export default async function IndustryPage({ params }: PageProps<"/industries/[slug]">) {
  const ind = industryBySlug((await params).slug);
  if (!ind) notFound();
  const programme = ind.programme.map(lineBySlug).filter(l => l !== undefined);

  return (
    <>
      {/* Hero: breadcrumb left, sentence headline across the right two thirds */}
      <section className="wrap pt-14 lg:pt-24">
        <div className="reveal grid gap-6 lg:grid-cols-12 lg:gap-12">
          <Eyebrow className="pt-3 lg:col-span-4"><Link href="/industries" className="hover:text-ink">Industries</Link> / {ind.name}</Eyebrow>
          <div className="flex flex-col gap-6 lg:col-span-8">
            <h1 className="display h1 text-ink">Insurance for {ind.name.toLowerCase()}</h1>
            <p className="text-[21px] font-medium leading-snug tracking-[-0.01em] text-ink md:text-[24px]">{ind.headline}</p>
            <p className="lede">{ind.summary}</p>
            <div className="flex flex-wrap gap-3"><ButtonLink href="#review">Request a programme review</ButtonLink></div>
          </div>
        </div>
        <Photo src={ind.image} alt={ind.name} priority className="mt-14 aspect-[16/9] w-full md:aspect-[21/9] lg:mt-20" />
      </section>

      {/* Stat triplet */}
      <section className="wrap section !pb-0 grid gap-8 lg:grid-cols-12 lg:gap-12">
        <Eyebrow className="lg:col-span-4">New South Sea for {ind.name.toLowerCase()}</Eyebrow>
        <dl className="grid gap-8 sm:grid-cols-3 lg:col-span-8">
          {["Clients in this sector", "Lines placed per client, median", "Premium placed, HKD"].map(label => (
            <div key={label} className="flex flex-col gap-2"><dd className="display text-[48px] leading-none text-ink">[—]</dd><dt className="text-[14px] text-muted">{label}</dt></div>
          ))}
        </dl>
      </section>

      {/* 01 Exposures */}
      <section className="wrap section flex flex-col gap-12">
        <SplitHead num="01" label="Exposures" title="Named risks" lede="Each risk, what it costs when it happens, and how the programme may respond." />
        <div className="grid gap-4 md:grid-cols-2">
          {ind.exposures.map((e, i) => (
            <div key={e.title} className="card flex flex-col gap-3 p-7">
              <span className="font-mono text-[13px] text-ultra">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">{e.title}</h3>
              <p className="body">{e.body}</p>
              <p className="mt-auto flex gap-3 border-t border-rule pt-4 text-[15px] leading-relaxed text-ink"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-bronze" aria-hidden />{e.response}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 02 The programme */}
      <section className="bg-stone">
        <div className="wrap section flex flex-col gap-12">
          <SplitHead num="02" label="The programme" title="Typical insurance programme" lede="The final structure depends on your contracts, sites and balance sheet. This is where the review starts." />
          <ul className="border-t border-rule">
            {programme.map(l => (
              <li key={l.slug}>
                <Link href={`/coverage/${l.slug}`} className="group grid gap-2 border-b border-rule py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-baseline md:gap-10">
                  <span className="display text-[26px] text-ink group-hover:text-umber">{l.name}</span>
                  <span className="body">{l.thesis}</span>
                  <span className="text-[14px] text-umber">Line detail</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 03 How we work */}
      <section className="wrap section flex flex-col gap-12">
        <SplitHead num="03" label="How we work" title="How we work" />
        <ol className="cells sm:grid-cols-2 lg:grid-cols-5">
          {PLACEMENT.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3 pt-6">
              <span className="font-mono text-[13px] text-ultra">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-[17px] font-semibold text-ink">{s.title}</span>
              <span className="body !text-[15px]">{s.headline}</span>
            </li>
          ))}
        </ol>
      </section>

      <QuoteBand />

      {/* FAQ */}
      <section className="wrap section grid gap-10 lg:grid-cols-[3fr_9fr] lg:gap-0">
        <Eyebrow className="pt-2">Questions</Eyebrow>
        <Faq items={ind.faqs} />
      </section>

      <CloseBand />
    </>
  );
}
