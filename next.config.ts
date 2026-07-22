import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow large file uploads via API Routes
  // Route handlers use Web API streams which don't have the 1MB Pages Router limit
};

export default nextConfig;
