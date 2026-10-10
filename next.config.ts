import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SITE_PERFORMANCE_BUILD === "1" ? ".next-performance" : ".next",
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
