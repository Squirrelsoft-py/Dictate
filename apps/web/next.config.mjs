/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dictate/shared'],
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      { source: '/auth/:path*', destination: `${apiUrl}/auth/:path*` },
    ];
  },
};
export default nextConfig;