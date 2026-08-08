import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-queue", "better-queue-memory", "adm-zip"],
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    proxyClientMaxBodySize: "150mb",
  },
};

export default nextConfig;
