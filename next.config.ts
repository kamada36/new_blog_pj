import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("https://media.resilient-cer.com/**")],
  },
};

export default nextConfig;
