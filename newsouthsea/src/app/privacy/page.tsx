import type { Metadata } from "next";
import { JbCol, JbHead, JbP } from "@/components/jb";
import { site } from "@/site";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Privacy" }]} title="Privacy" lede="Personal information collection statement." />
      <JbCol>
        <JbP>{site.entity} collects personal data under the Personal Data (Privacy) Ordinance (Cap. 486) to arrange and service insurance.</JbP>
        <JbP>[Full statement to be supplied by the client: purposes, transferees, retention, access and correction requests.]</JbP>
      </JbCol>
    </>
  );
}
