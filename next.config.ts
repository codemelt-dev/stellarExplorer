import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Playwright's production build separate from local development.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // A cached page older than 15 minutes is rebuilt before it's served, instead
  // of handed out once more while it rebuilds, so a visit after a quiet spell
  // never opens on hours-old DEX activity.
  expireTime: 900,
};

export default nextConfig;
