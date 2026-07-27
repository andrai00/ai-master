import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  experimental: {
    proxyClientMaxBodySize: "150mb",
  },
};

export default nextConfig;
