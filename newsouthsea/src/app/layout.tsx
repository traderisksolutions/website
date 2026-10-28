import type { Metadata } from "next";
import { EB_Garamond } from "next/font/google";
import { Reveal } from "@/components/reveal";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { site } from "@/site";
import "./globals.css";

// Serif for the mark, headings and statements. Body is Helvetica Neue from the system stack.
const eb = EB_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-eb" });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | A wholesale insurance brokerage for hard-to-place risks`, template: `%s | ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${eb.variable} antialiased`}>
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
