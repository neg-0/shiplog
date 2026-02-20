/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL || 'https://api.shiplog.io'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
