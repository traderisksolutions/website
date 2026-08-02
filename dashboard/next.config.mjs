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
};
export default nextConfig;
