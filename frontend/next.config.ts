import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// Single .env at the project root, shared with the backend. Variables
// already set in the environment win, so the Docker build's BACKEND_URL
// (http://backend:8000) takes precedence over the .env value.
loadEnvConfig(path.resolve(__dirname, ".."));

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone, used by the Docker image.
  output: "standalone",
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
