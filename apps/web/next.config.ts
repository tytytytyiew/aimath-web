import type { NextConfig } from 'next'

// When NEXT_PUBLIC_API_URL is empty, the browser calls same-origin /api/v1/*
// and Next proxies it to the API. This lets phones / tunnels reach the app
// through a single URL.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:8080'

const nextConfig: NextConfig = {
  transpilePackages: ['@mathviz/shared'],
  allowedDevOrigins: ['*.trycloudflare.com', '192.168.*.*', '10.*.*.*'],
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_PROXY_TARGET}/api/v1/:path*` }]
  },
}

export default nextConfig
