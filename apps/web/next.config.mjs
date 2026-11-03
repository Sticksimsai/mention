/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mention/shared"],
  // Shared source uses NodeNext .js imports; resolve those to TypeScript in the web build.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
