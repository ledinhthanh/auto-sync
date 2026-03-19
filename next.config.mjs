/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['ssh2', 'node-ssh', 'cpu-features'],
};

export default nextConfig;
