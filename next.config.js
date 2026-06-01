/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No bloqueamos el build por lint/types: queremos despliegues fiables en Vercel.
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
