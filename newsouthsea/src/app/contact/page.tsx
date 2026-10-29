import type { Metadata } from "next";
import { Contours } from "@/components/contours";
import { EnquiryForm } from "@/components/enquiry-form";
import { site } from "@/site";

export const metadata: Metadata = { title: "Contact", description: `Send ${site.name} the file. A named broker replies within one working day.` };

export default function Contact() {
  return (
    <div className="af-wrap">
      <Contours at="corner" tone="paper" />
      <div className="af-top">
        <h1 className="af-h1">Send us the file. Get the team.</h1>
        <p className="af-intro">Four short steps, about three minutes. We confirm receipt the same working day and reply within one. A confirmation is not a quote. Already have a packet? Email it to <span className="af-em">{site.email}</span>.</p>
      </div>
      <EnquiryForm />
    </div>
  );
}
