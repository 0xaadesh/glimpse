import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Single .env at the project root, shared with the backend.
loadEnvConfig(path.resolve(__dirname, ".."));

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  images: {
    // Only the backend-served gallery images (proxied below) may be
    // optimized, and only without a query string.
    localPatterns: [{ pathname: "/images/**", search: "" }],
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/images/:path*",
        destination: `${backendUrl}/images/:path*`,
      },
    ];
  },
};

export default nextConfig;
