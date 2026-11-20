/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse self-polyfills `DOMMatrix` via a dynamic `require('@napi-rs/canvas')` at
  // import time. Webpack's default bundling of that dynamic require breaks the native
  // binary lookup, so the polyfill silently fails and PDF text extraction throws
  // "DOMMatrix is not defined" (seen in RAG Index / Knowledge Base PDF ingestion).
  // Marking these external makes Next.js `require()` them directly from node_modules
  // at runtime instead, matching how they resolve outside of webpack.
  // isomorphic-dompurify pulls in jsdom, which reads its stylesheet from disk and breaks when bundled.
  // @react-pdf/renderer is required from node_modules on the server: bundled into a route handler
  // it is resolved against React's server build, whose internals its reconciler cannot read, and
  // every PDF render failed with "Cannot read properties of undefined (reading 'S')" (debit notes,
  // appointment letters, the group benefits client report). The browser preview imports it in a
  // client component, which is bundled for the browser as usual.
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'isomorphic-dompurify', '@react-pdf/renderer'],
  // The PDF documents (debit notes, appointment letters) read the brand fonts and the PayNow QR
  // from public/ at render time; ship them with every server route so Vercel functions find them.
  outputFileTracingIncludes: {
    '/api/**/*': ['./public/fonts/**', './public/debit-note/**'],
    // The commission check renders insurer PDF pages; pdf.js needs its own fonts and character
    // maps for text whose font is not embedded (src/lib/commission/redact.ts).
    '/api/attachments/commission-check': ['./node_modules/pdfjs-dist/standard_fonts/**', './node_modules/pdfjs-dist/cmaps/**'],
  },
  // Vercel sets VERCEL_GIT_COMMIT_SHA at build time but doesn't expose it to the client bundle
  // on its own — this re-exposes it under NEXT_PUBLIC_ so any page can render "which build is
  // this" directly, instead of having to curl-probe routes to tell whether a deploy actually
  // shipped or the browser is just showing a stale cache.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
  // Every moved address in one list (not a page per redirect), so old links and bookmarks land.
  async redirects() {
    return [
      { source: '/group-benefits', destination: '/pricing-matrix', permanent: true },
      { source: '/group-benefits/:path*', destination: '/pricing-matrix/:path*', permanent: true },
      { source: '/insurers', destination: '/companies?kind=insurer', permanent: false },
      { source: '/marketing', destination: '/websites/traderisksolutions', permanent: false },
      { source: '/sales', destination: '/sales/enquiries', permanent: false },
      { source: '/companies/portfolio', destination: '/companies', permanent: false },
      { source: '/work', destination: '/today', permanent: false },
      { source: '/documents', destination: '/claims/documents', permanent: true },
      // Employment Benefits has one home, /eb (Jarod, 20 Nov 2026). /pricing-matrix/quote/... stays: it
      // resolves an old quotation id to its proposal.
      { source: '/pricing-matrix', destination: '/eb/quotations', permanent: true },
      { source: '/pricing-matrix/new', destination: '/eb', permanent: true },
      { source: '/pricing-matrix/hr-links/:id', destination: '/eb/hr-links/:id', permanent: true },
      { source: '/pricing-matrix/company/:id', destination: '/companies/:id?tab=eb', permanent: true },
      { source: '/pricing-matrix/:id/schedule', destination: '/eb/rates/:id/schedule', permanent: true },
      { source: '/pricing-matrix/:id((?!quote$)[^/]+)', destination: '/eb/rates/:id', permanent: true },
      { source: '/companies/portfolio/desk', destination: '/companies', permanent: false },
    ]
  },
};
export default nextConfig;
