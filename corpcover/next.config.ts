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
  // The hero photo spans the full window. 5120 covers a 2560px-wide display at 2x.
  images: { deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 2560, 3840, 5120] },
  // Singapore moved from the root to /sg on 21 Oct 2026; every old URL keeps working.
  async redirects() {
    return ["/about", "/policy-review", "/articles", "/find", "/get-covered", "/how-we-compare"].flatMap(p => [
      { source: p, destination: `/sg${p}`, permanent: true },
      ...(p === "/articles" ? [{ source: "/articles/:slug", destination: "/sg/articles/:slug", permanent: true }] : []),
    ]);
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
