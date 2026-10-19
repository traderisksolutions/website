import type { Metadata } from "next";
import Link from "next/link";
import { Subscribe } from "@/components/subscribe";

export const metadata: Metadata = { title: "Subscription", robots: { index: false } };

export default async function Subscribed(props: PageProps<"/subscribed">) {
  const ok = (await props.searchParams).ok === "1";
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)]">
        <h1 className="text-[clamp(2.6rem,6vw,4.6rem)] font-semibold leading-[1.04] tracking-[-0.035em]">
          {ok ? "Subscription confirmed" : "Link not valid"}
        </h1>
        <p className="mt-5 max-w-[44ch] text-[clamp(1.2rem,1.9vw,1.6rem)] leading-[1.35] tracking-[-0.015em] text-ink-2">
          {ok ? "The next issue arrives on Tuesday morning." : "This link has expired or is not valid."}
        </p>
        {ok ? (
          <div className="mt-7"><Link href="/articles" className="btn btn-primary">Read the latest articles</Link></div>
        ) : (
          <Subscribe variant="inline" className="mt-7" />
        )}
      </section>
    </main>
  );
}
