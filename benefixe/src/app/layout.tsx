import type { Metadata } from "next";
import Script from "next/script";
import { site } from "@/site";

// GA4 for the /blogs routes. public/site.html (the home) carries the same id in its own GA_ID.
const GA = "G-0CH0TJTC33";

// The home is public/site.html (one page, hash views). The routes under /blogs render here with the
// same stylesheet and fonts, so no framework CSS is loaded: /site.css is the one source of styles.
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — Group benefits and the Insider Pass`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, url: site.url, type: "website", description: site.description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-SG">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400&display=swap" />
        <link rel="stylesheet" href="/site.css?v=20261110" />
      </head>
      <body>
        {children}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
        <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}');`}</Script>
      </body>
    </html>
  );
}
