import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JbCol, JbCta, JbH2, JbHead, JbNote, JbP, JbTrio } from "@/components/jb";
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
      <JbCol>
        <JbP>{line.summary}</JbP>
        <JbH2>What the policy may cover</JbH2>
        <JbTrio items={line.scope.map((s, i) => ({ title: String(i + 1).padStart(2, "0"), body: s }))} />
        <JbH2>What moves price and terms</JbH2>
        <JbP>Underwriters price what they can see. {line.factors.join(" ")}</JbP>
        <JbH2>The file we build</JbH2>
        <JbTrio cols={2} items={line.file.map((f, i) => ({ title: String(i + 1).padStart(2, "0"), body: f }))} />
        <JbH2>Three pitfalls at renewal</JbH2>
        <JbTrio items={line.pitfalls.map(p => ({ title: p.title, body: p.body }))} />
        <JbNote>Related lines: {related.map((r, i) => <span key={r.slug}>{i > 0 && ", "}<Link href={`/coverage/${r.slug}`}>{r.name}</Link></span>)}. Renewal should start {days} days before inception.</JbNote>
      </JbCol>
      <JbCta title={`Send the ${line.name.toLowerCase()} renewal ${days} days out.`} />
    </>
  );
}
