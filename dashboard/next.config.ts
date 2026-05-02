import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  staticPageGenerationTimeout: 60,
  output: "standalone",
};

export default nextConfig;
