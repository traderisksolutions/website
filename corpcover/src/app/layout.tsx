import type { Metadata } from "next";
import Script from "next/script";
import { site } from "@/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StartModal } from "@/components/start-actions";
import { JsonLd, siteGraph } from "@/lib/json-ld";
import "./globals.css";


export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | Business insurance for Singapore companies`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website", description: site.description },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

// GA4 loads only when NEXT_PUBLIC_GA_ID is set (G-XXXXXXXXXX). Nothing renders otherwise.
const GA = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <JsonLd data={siteGraph} />
        <SiteHeader />
        {children}
        <SiteFooter />
        <StartModal />
        {GA && <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />}
        {GA && <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');`}</Script>}
      </body>
    </html>
  );
}
