/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse self-polyfills `DOMMatrix` via a dynamic `require('@napi-rs/canvas')` at
  // import time. Webpack's default bundling of that dynamic require breaks the native
  // binary lookup, so the polyfill silently fails and PDF text extraction throws
  // "DOMMatrix is not defined" (seen in RAG Index / Knowledge Base PDF ingestion).
  // Marking these external makes Next.js `require()` them directly from node_modules
  // at runtime instead, matching how they resolve outside of webpack.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', '@napi-rs/canvas'],
  },
  // Vercel sets VERCEL_GIT_COMMIT_SHA at build time but doesn't expose it to the client bundle
  // on its own — this re-exposes it under NEXT_PUBLIC_ so any page can render "which build is
  // this" directly, instead of having to curl-probe routes to tell whether a deploy actually
  // shipped or the browser is just showing a stale cache.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
};
export default nextConfig;
