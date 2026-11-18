import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["pdfkit"],
  partialPrefetching: true,
  experimental: {
    cpus: 1,
    // Tax papers and challans are uploaded through forms (up to 5 MB each).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;