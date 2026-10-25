import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // 90 is for the hero artwork's halftone (see Hero.tsx); 75 is the default.
    qualities: [75, 90],
  },
};

export default nextConfig;
