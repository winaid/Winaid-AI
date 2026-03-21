import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Turbopack workspace root — 상위 디렉토리 lockfile 감지 경고 방지
  turbopack: {
    root: __dirname + '/..',
  },
};

export default nextConfig;
