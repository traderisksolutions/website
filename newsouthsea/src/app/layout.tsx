import type { Metadata } from "next";
import { Newsreader, Noto_Serif_TC } from "next/font/google";
import Script from "next/script";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/site";
import "./globals.css";

// NSS brand (locked 30 Oct 2026): Newsreader for the mark, headings and statements (italic only in NSS itself),
// Noto Serif TC for 新南海. Body stays Helvetica Neue from the system stack.
const news = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-news" });
const tc = Noto_Serif_TC({ weight: "400", preload: false, variable: "--font-tc" });

// GA4 loads only when NEXT_PUBLIC_GA_ID is set (G-XXXXXXXXXX). Nothing renders otherwise.
const GA = process.env.NEXT_PUBLIC_GA_ID;
const real = (v: string) => !v.startsWith("[");

// Entity record. Fields still bracketed in site.ts are left out until the client supplies them.
const org = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "InsuranceAgency"],
      "@id": `${site.url}/#org`,
      name: site.name,
      legalName: site.entity,
      alternateName: site.nameZh,
      url: site.url,
      areaServed: { "@type": "Country", name: "Hong Kong" },
      description: site.description,
      ...(real(site.email) ? { email: site.email } : {}),
      ...(real(site.phone) ? { telephone: site.phone } : {}),
      ...(real(site.address) ? { address: { "@type": "PostalAddress", streetAddress: site.address, addressRegion: "Hong Kong", addressCountry: "HK" } } : {}),
    },
    { "@type": "WebSite", "@id": `${site.url}/#site`, url: site.url, name: site.name, publisher: { "@id": `${site.url}/#org` } },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | A wholesale insurance brokerage for hard risks`, template: `%s | ${site.name}` },
  description: site.description,
  alternates: { canonical: "./" },
  openGraph: { siteName: site.name, url: "./", type: "website", images: [{ url: "/images/hero.jpg", width: 1600, height: 1000, alt: "Victoria Harbour skyline" }] },
  twitter: { card: "summary_large_image" },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${news.variable} ${tc.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
        <SiteHeader />
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <main className="relative isolate flex-1">
          {children}
          <Reveal />
        </main>
        <SiteFooter />
        {GA && <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />}
        {GA && <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');`}</Script>}
      </body>
    </html>
  );
}
