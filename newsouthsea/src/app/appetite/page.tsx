import type { Metadata } from "next";
import { JbCol, JbCta, JbH2, JbHead, JbP, JbTrio } from "@/components/jb";

export const metadata: Metadata = { title: "Appetite", description: "The classes we place, the ones we take case by case, and the ones we do not write." };

// Appetite lists are drafts for the client to confirm (28 Oct 2026).
const CASE_BY_CASE = [
  { title: "US products exposure", body: "Turnover by state and product, and the contracts, before any approach." },
  { title: "Cyber after an incident", body: "Placeable once the forensic report and remediation are complete." },
  { title: "D&O with a going-concern note", body: "Side A first, entity cover second. Covenant schedule in the file." },
  { title: "Typhoon-exposed single sites", body: "Flood height, construction and the loss record by event." },
  { title: "Run-off at change of control", body: "Six years agreed before closing. The sale agreement sets the limit." },
  { title: "Large contract works", body: "The contract's insurance clauses and the site plan decide the third-party limit." },
];

export default function AppetitePage() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Appetite" }]} title="Appetite" lede="The classes we place, the ones we take case by case, and the ones we do not write." />
      <JbCol>
        <JbP>Checked before you send the file, so no submission goes to a market that will not look at it. Status by class changes with market conditions and is reviewed at each renewal cycle.</JbP>
        <JbH2>Core appetite</JbH2>
        <JbP>Lines where we hold standing relationships and can give a first read on appetite and structure within [x] working days of a complete file.</JbP>
        <JbTrio items={[
          { title: "Property and construction", body: "Commercial property, including cat-exposed. Business interruption. Construction all risks." },
          { title: "Casualty and financial lines", body: "Public and products liability. Employees' compensation. D&O, listed and private. Professional indemnity. Cyber. Crime and fidelity." },
          { title: "Marine and trade", body: "Marine cargo and stock throughput. Trade credit." },
        ]} />
        <JbH2>Case by case</JbH2>
        <JbP>Placeable with the right file. Each needs facts the standard submission does not carry. We tell you which before going to market.</JbP>
        <JbTrio items={CASE_BY_CASE} />
        <JbH2>Not written</JbH2>
        <JbP>Personal lines. Individual life and medical. Employee benefits. Aviation and energy hull. Sent elsewhere on the first call, with a referral where we have one.</JbP>
      </JbCol>
      <JbCta title="Not sure which column the account sits in?" line="" />
    </>
  );
}
