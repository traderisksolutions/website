import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Cloud Run runs the self-contained server from .next/standalone.
  output: "standalone",
  poweredByHeader: false,
  // The home is one static page (public/site.html) that switches sections by #hash; /blogs are real routes.
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/site.html" }], afterFiles: [], fallback: [] };
  },
  // Old paths go to their page on the new site.
  async redirects() {
    return [
      { source: "/group-benefits", destination: "/#group-benefits", permanent: false },
      { source: "/perks", destination: "/#insider-pass", permanent: false },
      { source: "/site.html", destination: "/", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
