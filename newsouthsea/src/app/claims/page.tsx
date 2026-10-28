import type { Metadata } from "next";
import { Faq, JbCol, JbCta, JbH2, JbHead, JbP, JbStages, JbTrio } from "@/components/jb";
import { site } from "@/site";

export const metadata: Metadata = { title: "Claims", description: "How New South Sea notifies, prepares and negotiates claims for corporate clients." };

const STAGES = [
  { title: "Notify", headline: "Report first, investigate second.", body: "Most policies require notice as soon as practicable. We notify the insurer on the same working day and record what was sent.", points: ["Notice within policy time limits", "Circumstances recorded for claims-made policies", "Immediate steps to limit the loss agreed"] },
  { title: "Assess", headline: "Read the policy before the adjuster does.", body: "We map the loss against the wording: which section responds, what extensions apply and what the insurer is likely to dispute.", points: ["Coverage position set out in writing", "Adjuster appointment reviewed", "Experts appointed where the loss requires"] },
  { title: "Prepare", headline: "A claim is a case. It is built on evidence.", body: "We assemble the documents, quantify the loss and present it in the form the insurer and adjuster need to agree it.", points: ["Loss quantified with supporting records", "Business interruption calculated against the policy basis", "Requests for information answered in one pass"] },
  { title: "Negotiate", headline: "Settlement is negotiated, not relayed.", body: "We challenge reductions, deductions and declinatures where the wording supports you, and escalate within the insurer when needed.", points: ["Interim payments requested for large losses", "Disputed points argued on the wording", "Escalation and complaint routes used where justified"] },
  { title: "Review", headline: "Every claim changes the next renewal.", body: "After settlement we review what the claim showed about limits, wordings and controls, and adjust the programme before the market prices it.", points: ["Lessons recorded on the client file", "Wording changes proposed at renewal", "Loss history presented with context"] },
];
const FAQS = [
  { q: "Who do we call when something happens?", a: `Your named claims contact, or ${site.claimsEmail} out of hours. Notify first; details can follow.` },
  { q: "Do you handle claims on policies you did not place?", a: "For new clients we can take over open claims under a broker of record letter, subject to the insurer's agreement." },
  { q: "What if the insurer declines the claim?", a: "We review the declinature against the wording and challenge it where it is wrong. Where needed, we refer the dispute to the Insurance Complaints Bureau or legal counsel." },
];

export default function Claims() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Claims" }]} title="Claims" lede="A named claims contact for every client, from first notice to settlement." />
      <JbCol>
        <JbP>To notify a claim now: <strong>{site.claimsEmail}</strong> · {site.phone}. Notify first; details can follow.</JbP>
        <JbP>The claim is where the placement is tested. The broker who placed the risk stays on the claim: notification, coverage position, quantum and settlement, argued on the wording.</JbP>
        <JbStages stages={STAGES} />
        <JbH2>Claims record</JbH2>
        <JbTrio items={[{ title: "Claims handled in [year]", body: "[—]" }, { title: "Median days from notice to settlement", body: "[—]" }, { title: "Settled amount as a share of amount claimed", body: "[—]" }]} />
        <JbH2>Questions</JbH2>
        <Faq items={FAQS} />
      </JbCol>
      <JbCta title={<>Report the loss first. The wording comes next.</>} line={`${site.claimsEmail} · ${site.hours}`} />
    </>
  );
}
