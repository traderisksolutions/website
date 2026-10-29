import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JbCta, JbH2, JbHead, JbNote, JbP, JbSplit, JbStack, JbTicks } from "@/components/jb";
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
  const days = line.family === "Financial lines" ? 150 : 120;

  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Coverage", href: "/coverage" }, { label: line.family }]} title={line.name} lede={line.thesis} />
      <JbSplit image={line.image} alt={line.name}>
        <JbP>{line.summary}</JbP>
        <JbH2>What the policy may cover</JbH2>
        <JbTicks items={line.scope} />
        <JbH2>What moves price and terms</JbH2>
        <JbTicks items={line.factors} />
        <JbH2>The file we build</JbH2>
        <JbTicks items={line.file} />
        <JbH2>Three pitfalls at renewal</JbH2>
        <JbStack items={line.pitfalls} />
        <JbNote>Related lines: {related.map((r, i) => <span key={r.slug}>{i > 0 && ", "}<Link href={`/coverage/${r.slug}`}>{r.name}</Link></span>)}. Renewal should start {days} days before inception.</JbNote>
      </JbSplit>
      <JbCta title={`Send the ${line.name.toLowerCase()} renewal ${days} days out.`} />
    </>
  );
}
