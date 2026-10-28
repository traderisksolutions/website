import type { Metadata } from "next";
import { Cormorant_Garamond, EB_Garamond, Geist, Geist_Mono } from "next/font/google";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-geist-mono" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-cormorant" });
const eb = EB_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-eb" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | Complex business risks, placed and claimed`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${cormorant.variable} ${eb.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <main className="relative isolate flex-1">
          {children}
          <Reveal />
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
