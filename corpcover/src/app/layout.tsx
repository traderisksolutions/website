import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { site } from "@/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StartModal } from "@/components/start-actions";
import { JsonLd, siteGraph } from "@/lib/json-ld";
import "./globals.css";

// Helvetica everywhere. Inter Tight only stands in for the hero's hairline where Helvetica is not installed.
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["200"], variable: "--font-inter-tight", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — Business insurance for Singapore companies`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website", description: site.description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={`${interTight.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <JsonLd data={siteGraph} />
        <SiteHeader />
        {children}
        <SiteFooter />
        <StartModal />
      </body>
    </html>
  );
}
