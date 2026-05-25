import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/ui", "@repo/api", "@repo/db", "@repo/types"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  env: {
    NEXT_PUBLIC_BRAND_COLOR_PRIMARY:
      process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY || "E8832A",
    NEXT_PUBLIC_BRAND_COLOR_DARK:
      process.env.NEXT_PUBLIC_BRAND_COLOR_DARK || "1A1D2E",
  },
};

export default nextConfig;
