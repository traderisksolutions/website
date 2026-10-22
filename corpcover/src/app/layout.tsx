import type { Metadata } from "next";
import { Inter, Newsreader } from "next/font/google";
import { site } from "@/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { StartModal } from "@/components/start-actions";
import { JsonLd, siteGraph } from "@/lib/json-ld";
import "./globals.css";

// Apple type: SF Pro on Apple devices (system font), Inter where SF Pro is not installed.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });
// Serif for display headings (Harvey / Chapter pattern): one weight, size does the work.
const serif = Newsreader({ subsets: ["latin"], weight: ["400"], style: ["normal"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | Business insurance for Singapore companies`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website", description: site.description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
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
