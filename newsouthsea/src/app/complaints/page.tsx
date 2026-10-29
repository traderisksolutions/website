import type { Metadata } from "next";
import { JbCol, JbHead, JbP } from "@/components/jb";
import { site } from "@/site";

export const metadata: Metadata = { title: "Complaints" };

export default function Complaints() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Complaints" }]} title="Complaints" lede="How a complaint is handled and the routes beyond us." />
      <JbCol>
        <JbP>Write to the Complaints Officer at {site.email}. We acknowledge within [x] working days and reply in full within [x] days.</JbP>
        <JbP>If you are not satisfied with our reply, you may refer the matter to the Insurance Authority or, for disputes with an insurer, the Insurance Complaints Bureau.</JbP>
        <JbP>[Full procedure to be supplied by the client&rsquo;s compliance officer.]</JbP>
      </JbCol>
    </>
  );
}
