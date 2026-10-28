import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { site } from "@/site";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <section className="wrap section grid gap-8 lg:grid-cols-12 lg:gap-12">
      <Eyebrow className="pt-3 lg:col-span-4">Privacy</Eyebrow>
      <div className="flex max-w-2xl flex-col gap-5 lg:col-span-8">
        <h1 className="display h2 text-ink">Personal information collection statement</h1>
        <p className="body">{site.entity} collects personal data under the Personal Data (Privacy) Ordinance (Cap. 486) to arrange and service insurance.</p>
        <p className="body">[Full statement to be supplied by the client: purposes, transferees, retention, access and correction requests.]</p>
      </div>
    </section>
  );
}
