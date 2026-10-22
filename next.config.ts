import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: `output: "standalone"` is intentionally NOT set — Next.js 16.1.x
  // Turbopack builds silently omit .next/standalone/server.js (upstream bug
  // vercel/next.js#88844), which crash-loops any host told to run it.
  // Run with `next start` (reads PORT/HOSTNAME env) — works on Render,
  // Fly, Railway, VPS, or a home server out of the box.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
