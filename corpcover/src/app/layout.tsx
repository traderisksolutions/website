import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader, Spectral } from "next/font/google";
import { site } from "@/site";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-hanken" });
const spectral = Spectral({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-spectral" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — Business insurance for Singapore companies`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website", description: site.description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG" className={`${newsreader.variable} ${spectral.variable} ${hanken.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
