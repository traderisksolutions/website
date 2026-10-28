import type { Metadata } from "next";
import { EnquiryForm } from "@/components/enquiry-form";
import { Eyebrow } from "@/components/ui";
import { site } from "@/site";

export const metadata: Metadata = { title: "Contact", description: "Contact New South Sea for a programme review, a claim or another enquiry." };

const DOORS = [
  { title: "Programme review", body: "Renewals, new programmes and second opinions on current cover.", contact: site.email },
  { title: "Claims", body: "New notifications and claims in progress.", contact: site.claimsEmail },
  { title: "Insurers and partners", body: "Capacity, binding arrangements and introductions.", contact: site.email },
  { title: "Careers", body: "Broking, account handling and claims roles.", contact: site.email },
];

export default function Contact() {
  return (
    <>
      <section className="wrap pt-14 lg:pt-24">
        <div className="reveal grid gap-6 lg:grid-cols-12 lg:gap-12">
          <Eyebrow className="pt-3 lg:col-span-4">Contact</Eyebrow>
          <div className="flex flex-col gap-6 lg:col-span-8">
            <h1 className="display h1 text-ink">Contact</h1>
            <p className="lede">{site.hours}. Replies within one working day.</p>
          </div>
        </div>
      </section>

      <section className="wrap section !pb-0">
        <ul className="cells sm:grid-cols-2 lg:grid-cols-4">
          {DOORS.map(d => (
            <li key={d.title} className="flex flex-col gap-3 pt-6">
              <span className="text-[18px] font-semibold text-ink">{d.title}</span>
              <span className="body !text-[15px]">{d.body}</span>
              <span className="mt-auto pt-3 text-[14px] text-ultra">{d.contact}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="review" className="wrap section grid scroll-mt-20 gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
        <div className="flex flex-col gap-6">
          <h2 className="display h2 text-ink">Write to us</h2>
          <dl className="grid gap-4 text-[15px]">
            <div><dt className="eyebrow">Office</dt><dd className="mt-1 text-ink">{site.address}</dd></div>
            <div><dt className="eyebrow">Telephone</dt><dd className="mt-1 text-ink">{site.phone}</dd></div>
            <div><dt className="eyebrow">Licence</dt><dd className="mt-1 text-ink">Insurance Authority {site.licence}</dd></div>
          </dl>
        </div>
        <EnquiryForm />
      </section>
    </>
  );
}
