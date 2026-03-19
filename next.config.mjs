/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['ssh2', 'node-ssh', 'cpu-features'],
  },
};

export default nextConfig;
