import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Faq, JbCol, JbCta, JbH2, JbHead, JbLinks, JbP, JbTrio } from "@/components/jb";
import { lineBySlug } from "@/content/coverage";
import { INDUSTRIES, industryBySlug } from "@/content/industries";

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
  const days = programme.some(l => l.family === "Financial lines") ? 150 : 120;

  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Industries", href: "/industries" }, { label: ind.name }]} title={ind.name} lede={ind.headline} />
      <JbCol>
        <JbP>{ind.summary}</JbP>
        <JbP>{ind.exposures.length} exposures produce most of the claims in this sector. Each has a response in the programme.</JbP>
        <JbH2>Named risks</JbH2>
        <JbTrio cols={2} items={ind.exposures.map(e => ({ title: e.title, body: e.body, response: e.response }))} />
        <JbH2>The programme</JbH2>
        <JbLinks rows={programme.map(l => ({ title: l.name, sub: l.thesis, href: `/coverage/${l.slug}` }))} />
        <JbH2>Questions</JbH2>
        <Faq items={ind.faqs} />
      </JbCol>
      <JbCta title={`Send the ${ind.name.toLowerCase()} programme ${days} days out.`} />
    </>
  );
}
