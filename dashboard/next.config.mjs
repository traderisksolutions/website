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
  },
  // Vercel sets VERCEL_GIT_COMMIT_SHA at build time but doesn't expose it to the client bundle
  // on its own — this re-exposes it under NEXT_PUBLIC_ so any page can render "which build is
  // this" directly, instead of having to curl-probe routes to tell whether a deploy actually
  // shipped or the browser is just showing a stale cache.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
  // Group Benefits became Pricing Matrix on 2 Oct 2026. Old links and bookmarks still land.
  async redirects() {
    return [
      { source: '/group-benefits', destination: '/pricing-matrix', permanent: true },
      { source: '/group-benefits/:path*', destination: '/pricing-matrix/:path*', permanent: true },
    ]
  },
};
export default nextConfig;
