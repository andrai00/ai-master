import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-queue", "better-queue-memory", "adm-zip"],
  turbopack: {
    root: __dirname,
  },
  experimental: {
    proxyClientMaxBodySize: "150mb",
  },
};

export default nextConfig;
