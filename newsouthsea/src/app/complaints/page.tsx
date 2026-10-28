import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { site } from "@/site";

export const metadata: Metadata = { title: "Complaints" };

export default function Complaints() {
  return (
    <section className="wrap section grid gap-8 lg:grid-cols-12 lg:gap-12">
      <Eyebrow className="pt-3 lg:col-span-4">Complaints</Eyebrow>
      <div className="flex max-w-2xl flex-col gap-5 lg:col-span-8">
        <h1 className="display h2 text-ink">Complaints procedure</h1>
        <p className="body">Write to the Complaints Officer at {site.email}. We acknowledge within [x] working days and reply in full within [x] days.</p>
        <p className="body">If you are not satisfied with our reply, you may refer the matter to the Insurance Authority or, for disputes with an insurer, the Insurance Complaints Bureau.</p>
        <p className="body">[Full procedure to be supplied by the client&rsquo;s compliance officer.]</p>
      </div>
    </section>
  );
}
