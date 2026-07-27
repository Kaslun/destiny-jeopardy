import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The room server is a separate Worker; nothing here needs a Node runtime.
  reactStrictMode: true,
};

export default nextConfig;
