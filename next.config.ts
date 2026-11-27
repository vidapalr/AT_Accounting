import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["pdfkit"],
  partialPrefetching: true,
  experimental: {
    cpus: 1,
    // Tax papers and challans are uploaded through forms (up to 5 MB each).
    serverActions: { bodySizeLimit: "6mb" },
    // Every request passes through src/proxy.ts, which by default keeps only the first 10 MB of a body:
    // larger photo / video uploads arrived cut off and failed. A video can be up to 60 MB.
    proxyClientMaxBodySize: "80mb",
  },
};

export default nextConfig;