import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Call-list CSV exports from a Smart List can be several MB.
    serverActions: { bodySizeLimit: "40mb" },
  },
};

export default nextConfig;
