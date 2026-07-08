/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@dictate/shared'],
  async rewrites() {
    const apiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3001';
    // Better-Auth's default basePath is /api/auth. All Dictate API routes
    // live under /api/*, so a single rewrite covers everything (including
    // auth, uploads, tags, speakers, jobs, progress, exports).
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
    ];
  },
};
export default nextConfig;