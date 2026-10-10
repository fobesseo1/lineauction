import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SITE_PERFORMANCE_BUILD === "1" ? ".next-performance" : ".next",
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  // On the public read-only deployment, let Vercel's CDN serve catalog pages for 60s and
  // refresh them in the background, so most visits skip the database round trip.
  async headers() {
    if (process.env.NEXT_PUBLIC_READ_ONLY_SITE !== "1") return [];
    const cdn = [{ key: "Vercel-CDN-Cache-Control", value: "max-age=60, stale-while-revalidate=600" }];
    return ["/dashboard", "/properties", "/properties/:id", "/test", "/api/properties"].map(source => ({ source, headers: cdn }));
  },
};

export default nextConfig;
