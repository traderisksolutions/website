import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribed(props: PageProps<"/unsubscribed">) {
  const ok = (await props.searchParams).ok === "1";
  return (
    <main className="flex-1">
      <section className="wrap pb-[clamp(80px,10vw,140px)] pt-[clamp(48px,8vw,104px)]">
        <h1 className="t-h1">
          {ok ? "You are unsubscribed" : "Link not valid"}
        </h1>
        <p className="mt-5 t-lede">
          {ok ? "You will not receive the Corp Cover letter again." : "This link is not valid."}
        </p>
        <div className="mt-7"><Link href="/articles" className="btn btn-ghost">Read the insights</Link></div>
      </section>
    </main>
  );
}
