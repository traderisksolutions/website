import type { Metadata } from "next";
import Link from "next/link";
import { JbApart, JbCol, JbCta, JbH2, JbHead, JbLinks, JbNote, JbP } from "@/components/jb";
import { FAMILIES, LINES } from "@/content/coverage";

export const metadata: Metadata = { title: "Coverage", description: "Ten lines in four families. What each policy may cover, what moves price and terms, and the file we build." };

export default function CoveragePage() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Coverage" }]} title="Coverage" lede="Ten lines in four families. Each guide states what the policy may cover, what moves price and terms, and the file we build before going to market." />
      <JbCol>
        <JbP>Standard programmes are written for standard risks. The lines below are placed for companies whose exposures do not fit the form: cat-exposed property, regulated financial firms, products sold into the United States, cyber after an incident, large contract works.</JbP>
        <JbP>Each guide is written for the reader who buys insurance for a living. It sets out the scope of cover, the facts that move price and terms, what we ask for before going to market, and the three mistakes we see most often at renewal.</JbP>
        {FAMILIES.map(f => (
          <div key={f} style={{ display: "contents" }}>
            <JbH2>{f}</JbH2>
            <JbLinks rows={LINES.filter(l => l.family === f).map(l => ({ title: l.name, sub: l.summary, href: `/coverage/${l.slug}` }))} />
          </div>
        ))}
        <JbNote>Appetite by class, including the accounts taken case by case, is set out on the <Link href="/appetite">Appetite</Link> page.</JbNote>
      </JbCol>
      <JbApart label="What sets us apart" items={[
        { title: "Wording before price", body: "Two policies at the same premium can pay very different claims. Every quote is compared clause by clause." },
        { title: "Selected markets", body: "Risks go to insurers with real appetite for them. A short list of strong approaches returns better terms than a wide circulation." },
        { title: "Claims are part of the job", body: "The broker who placed the cover stays with the claim. Placement and claims advice are not separated." },
      ]} />
      <JbCta title="Send the renewal 120 days out." line="" />
    </>
  );
}
