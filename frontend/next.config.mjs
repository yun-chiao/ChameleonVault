/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ethers must run in the Node.js runtime, not be bundled for Edge.
  serverExternalPackages: ["ethers"],
};

export default nextConfig;
