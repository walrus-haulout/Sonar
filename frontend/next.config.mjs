/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.walrus-testnet.walrus.space',
      },
      {
        protocol: 'https',
        hostname: '**.walrus.space',
      },
    ],
  },
  experimental: {
    turbopack: {
      resolveAlias: {
        fs: false,
        net: false,
        tls: false,
      },
    },
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
