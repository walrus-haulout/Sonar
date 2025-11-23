/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.walrus.space",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/stats",
        destination: "/tokenomics",
        permanent: true,
      },
    ];
  },
  experimental: {
    externalDir: true,
  },
  turbopack: {},
};

export default nextConfig;
