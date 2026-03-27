/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@spaceguard/shared"],
};

module.exports = nextConfig;
