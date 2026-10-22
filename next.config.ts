import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Playwright's production build separate from local development.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
