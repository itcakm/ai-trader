/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Enable static export for S3/CloudFront hosting
  output: 'export',
  
  // Disable image optimization for static export (not supported)
  images: {
    unoptimized: true,
  },
  
  // Trailing slashes help with S3 routing
  trailingSlash: true,
};

module.exports = nextConfig;
