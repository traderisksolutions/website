import type { Metadata } from "next";
import { JbApart, JbCol, JbCta, JbHead, JbP, JbStages } from "@/components/jb";
import { PLACEMENT } from "@/content/process";

export const metadata: Metadata = { title: "How it works", description: "Five stages on every renewal, handled by the same broker from review to claim." };

export default function HowWeWork() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "How it works" }]} title="How it works" lede="Five stages on every renewal, handled by the same broker from review to claim." />
      <JbCol>
        <JbP>Start with the renewal file, 120 days before inception for property and casualty and 150 for financial lines. No portal and no form to fill: send the current policies, the schedules and the loss runs you already hold. The named broker reads them against how the business operates today and tells you what the market will ask for before it asks.</JbP>
        <JbP>Every stage produces a document the client sees.</JbP>
        <JbStages stages={PLACEMENT} />
      </JbCol>
      <JbApart id="terms" label="Terms of engagement" items={[
        { title: "We act for you", body: "As a licensed broker our duty is to the policyholder. Advice is given on suitability, not on which insurer pays more." },
        { title: "Remuneration disclosed", body: "Brokerage and fees are stated in writing before cover is placed, by line and by insurer." },
        { title: "Written advice", body: "Every renewal closes with a written summary of what was placed, what was declined and why." },
      ]} />
      <JbCta title={<>Send us the account everyone else said no to.</>} />
    </>
  );
}
