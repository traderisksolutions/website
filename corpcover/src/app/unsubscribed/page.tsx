import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribed(props: PageProps<"/unsubscribed">) {
  const ok = (await props.searchParams).ok === "1";
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)]">
        <h1 className="text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
          {ok ? "You are unsubscribed" : "Link not valid"}
        </h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">
          {ok ? "You will not receive the Corp Cover letter again." : "This link is not valid."}
        </p>
        <div className="mt-7"><Link href="/articles" className="btn btn-ghost">Read the latest articles</Link></div>
      </section>
    </main>
  );
}
