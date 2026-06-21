/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design reference HTML lives in /design-reference and is not part of the build.
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
