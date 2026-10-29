import type { Metadata } from "next";
import { JbApart, JbCol, JbCta, JbH2, JbHead, JbLinks, JbP } from "@/components/jb";
import { INDUSTRIES } from "@/content/industries";

export const metadata: Metadata = { title: "Industries", description: "Six sectors. Named risks, what they cost when they happen, and the lines that make up the programme." };

export default function IndustriesPage() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Industries" }]} title="Industries" lede="Six sectors. Each page names the risks, what they cost when they happen, and the lines that make up the programme." />
      <JbCol>
        <JbP>A clean loss run is not evidence of a well-insured business. It is evidence that the large loss has not happened yet. Each sector page names the exposures that produce the large loss in that industry and sets out the line and the wording that respond to it.</JbP>
        <JbH2>Sectors</JbH2>
        <JbLinks rows={INDUSTRIES.map(i => ({ title: i.name, sub: i.headline, href: `/industries/${i.slug}` }))} />
      </JbCol>
      <JbApart label="What sets us apart" items={[
        { title: "Named risks, not a brochure", body: "Each exposure is stated with what it costs when it happens and the cover that answers it." },
        { title: "One programme per sector", body: "Limits, extensions and carve-backs chosen for the industry, built from the ten lines we place." },
        { title: "The same team at claim", body: "The broker who placed the programme argues the wording when the sector risk materialises." },
      ]} />
      <JbCta title={<>Send us the account everyone else said no to.</>} />
    </>
  );
}
