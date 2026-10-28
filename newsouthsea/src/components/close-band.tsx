import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/site";
import { Accent, Arrow, Eyebrow } from "./ui";

/** Closing band, Hedge "Ready when you are" style: label left, two-tone statement, pills and the direct line. */
export function CloseBand({ title, kind = "review" }: { title?: ReactNode; kind?: "review" | "claim" | "general" }) {
  const t = title ?? (kind === "claim"
    ? <>Report the loss first. <Accent>The wording comes next.</Accent></>
    : <>Send us the risk the last broker <Accent>could not place.</Accent></>);
  return (
    <section id="review" className="scroll-mt-20 bg-stone">
      <div className="wrap section grid gap-8 lg:grid-cols-12 lg:gap-0">
        <Eyebrow className="pt-4 lg:col-span-3">{kind === "claim" ? "Claims" : "Ready when you are"}</Eyebrow>
        <div className="flex min-w-0 flex-col lg:col-span-9">
          <h2 className="display h1 max-w-[18ch] text-ink">{t}</h2>
          <div className="mt-12 flex flex-col gap-6 border-t border-rule-strong pt-8 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              <Link href="/contact#review" className="btn btn-primary">{kind === "claim" ? "Report a claim" : "Request a programme review"}<Arrow /></Link>
              <Link href="/coverage" className="btn btn-ghost">Lines we place</Link>
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12.5px] uppercase tracking-[0.04em] text-muted">
              <span className="text-ink">Direct line</span>
              <span className="text-ink underline decoration-rule-strong underline-offset-4">{kind === "claim" ? site.claimsEmail : site.email}</span>
              <span>{site.hours}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
