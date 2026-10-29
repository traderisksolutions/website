import type { Metadata } from "next";
import { JbApart, JbCol, JbCta, JbH2, JbHead, JbNote, JbP, JbTrio } from "@/components/jb";
import { site } from "@/site";

export const metadata: Metadata = { title: "About", description: "The same team from placement to claim." };

const TEAM = [
  { name: "Cai Yi Harmony Tan", url: "https://www.linkedin.com/in/cai-yi-harmony-tan-597a13257/", bio: "Founder. Underwriter at MAPFRE RE, Singapore, 2023 to 2026. The University of Hong Kong, Economics and Finance. Certificate in Alternative Investments, Harvard Business School Online, 2026." },
  { name: "[Name 2]", url: "", bio: "[Title]. [Prior roles, markets and lines handled, years in the market.] [LinkedIn URL]" },
  { name: "[Name 3]", url: "", bio: "[Title]. [Prior roles, markets and lines handled, years in the market.] [LinkedIn URL]" },
];

export default function About() {
  return (
    <>
      <JbHead crumbs={[{ label: "Home", href: "/" }, { label: "Company" }]} title={`About ${site.name}`} lede="The same team from placement to claim." />
      <JbCol>
        <JbP>[Founding year, founders and the reason the firm was set up. Two sentences.]</JbP>
        <JbP>{site.entity}, {site.nameZh}, is a licensed insurance broker company regulated by the Insurance Authority. Specialty and commercial lines placement, wording negotiation and claims advocacy for corporates.</JbP>
        <JbH2>Principles</JbH2>
        <JbTrio cols={2} items={[
          { title: "Wording before price", body: "Two policies at the same premium can pay very different claims. Every quote is compared clause by clause." },
          { title: "Selected markets", body: "A short list of strong approaches returns better terms than a wide circulation." },
          { title: "Claims are part of the job", body: "The broker who placed the cover stays with the claim." },
          { title: "Advice in writing", body: "Recommendations, declinatures and the reasons for both are recorded and sent to the client." },
        ]} />
        <JbH2>Team</JbH2>
        <JbTrio items={TEAM.map(t => ({
          title: t.url ? <a href={t.url} target="_blank" rel="noopener" className="jb-person">{t.name} <span className="jb-in">in</span></a> : <span className="jb-person">{t.name} <span className="jb-in">in</span></span>,
          body: t.bio,
        }))} />
        <JbNote>Remaining profiles are placeholders until the client supplies the team.</JbNote>
      </JbCol>
      <JbApart label="Credentials" items={[
        { title: "Insurance Authority", body: `Licensed broker company · ${site.licence}` },
        { title: "Client monies", body: "Segregated client account under Cap. 41" },
        { title: "Professional indemnity", body: "[Insurer and limit] · Membership [HKCIB or PIBA]" },
      ]} />
      <JbCta title={<>Send us the account everyone else said no to.</>} />
    </>
  );
}
