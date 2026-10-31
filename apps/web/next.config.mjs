/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@tribes/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
