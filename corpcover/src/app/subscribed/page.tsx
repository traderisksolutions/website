import type { Metadata } from "next";
import Link from "next/link";
import { Subscribe } from "@/components/subscribe";

export const metadata: Metadata = { title: "Subscription", robots: { index: false } };

export default async function Subscribed(props: PageProps<"/subscribed">) {
  const ok = (await props.searchParams).ok === "1";
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)]">
        <h1 className="t-h1">
          {ok ? "Subscription confirmed" : "Link not valid"}
        </h1>
        <p className="mt-5 t-lede">
          {ok ? "One email a week, with the new articles. Unsubscribe from any issue in one click." : "This link has expired or is not valid."}
        </p>
        {ok ? (
          <div className="mt-7"><Link href="/articles" className="btn btn-primary">Read the insights</Link></div>
        ) : (
          <Subscribe variant="inline" className="mt-7" />
        )}
      </section>
    </main>
  );
}
