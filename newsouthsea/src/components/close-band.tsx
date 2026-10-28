import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/site";

/** Closing band on the night harbour: label chip, statement, Request a programme review, direct line. */
export function CloseBand({ label = "Ready when you are", title, email }: { label?: string; title?: ReactNode; email?: string }) {
  return (
    <section className="night">
      <div className="wrap sec close">
        <p className="eb"><span className="l">{label}</span></p>
        <h2 className="h2">{title ?? <>Send us the account everyone else <span className="accent">said no to.</span></>}</h2>
        <div className="btns"><Link href="/contact?purpose=review" className="btn">Request a programme review <span className="arrow">↗</span></Link><Link href="/coverage" className="btn ghost">Lines we place</Link></div>
        <p className="line"><b>Direct line</b><span>{email ?? site.email}</span><span>{site.hours}</span></p>
      </div>
    </section>
  );
}
