/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mention/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
