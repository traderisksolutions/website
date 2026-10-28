import type { Metadata } from "next";
import { CloseBand } from "@/components/close-band";
import { StatRows } from "@/components/proof";
import { StageTimeline, type Stage } from "@/components/stage-timeline";
import { Eyebrow, Faq } from "@/components/ui";
import { site } from "@/site";

export const metadata: Metadata = { title: "Claims", description: "How New South Sea notifies, prepares and negotiates claims for corporate clients." };

const STAGES: Stage[] = [
  { title: "Notify", headline: "Report first, investigate second.", body: "Most policies require notice as soon as practicable. We notify the insurer on the same working day and record what was sent.", points: ["Notice within policy time limits", "Circumstances recorded for claims-made policies", "Immediate steps to limit the loss agreed"], photo: "industrial" },
  { title: "Assess", headline: "Read the policy before the adjuster does.", body: "We map the loss against the wording: which section responds, what extensions apply and what the insurer is likely to dispute.", points: ["Coverage position set out in writing", "Adjuster appointment reviewed", "Experts appointed where the loss requires"], photo: "boardroom" },
  { title: "Prepare", headline: "A claim is a case. It is built on evidence.", body: "We assemble the documents, quantify the loss and present it in the form the insurer and adjuster need to agree it.", points: ["Loss quantified with supporting records", "Business interruption calculated against the policy basis", "Requests for information answered in one pass"], photo: "documents" },
  { title: "Negotiate", headline: "Settlement is negotiated, not relayed.", body: "We challenge reductions, deductions and declinatures where the wording supports you, and escalate within the insurer when needed.", points: ["Interim payments requested for large losses", "Disputed points argued on the wording", "Escalation and complaint routes used where justified"], photo: "office" },
  { title: "Review", headline: "Every claim changes the next renewal.", body: "After settlement we review what the claim showed about limits, wordings and controls, and adjust the programme before the market prices it.", points: ["Lessons recorded on the client file", "Wording changes proposed at renewal", "Loss history presented with context"], photo: "documents" },
];

const FAQS = [
  { q: "Who do we call when something happens?", a: `Your named claims contact, or ${site.claimsEmail} out of hours. Notify first; details can follow.` },
  { q: "Do you handle claims on policies you did not place?", a: "For new clients we can take over open claims under a broker of record letter, subject to the insurer's agreement." },
  { q: "What if the insurer declines the claim?", a: "We review the declinature against the wording and challenge it where it is wrong. Where needed, we refer the dispute to the Insurance Complaints Bureau or legal counsel." },
];

export default function Claims() {
  return (
    <>
      <section className="wrap pt-14 lg:pt-24">
        <div className="reveal grid gap-6 lg:grid-cols-12 lg:gap-12">
          <Eyebrow className="pt-3 lg:col-span-4">Claims</Eyebrow>
          <div className="flex flex-col gap-6 lg:col-span-8">
            <h1 className="display h1 text-ink">Claims</h1>
            <p className="lede">A named claims contact for every client, from first notice to settlement.</p>
            <p className="text-[15px] text-ink-2">To notify a claim now: <span className="font-semibold text-ink">{site.claimsEmail}</span> · {site.phone}</p>
          </div>
        </div>
      </section>
      <section className="wrap section"><StageTimeline stages={STAGES} id="claim" /></section>
      <section className="bg-night">
        <div className="wrap section"><StatRows dark title="Claims record" rows={[
          { label: "Claims handled in [year]", value: "[—]" },
          { label: "Median days from notice to settlement", value: "[—]" },
          { label: "Settled amount as a share of amount claimed", value: "[—]" },
        ]} /></div>
      </section>
      <section className="wrap section grid gap-10 lg:grid-cols-[3fr_9fr] lg:gap-0">
        <Eyebrow className="pt-2">Questions</Eyebrow>
        <Faq items={FAQS} />
      </section>
      <CloseBand kind="claim" />
    </>
  );
}
