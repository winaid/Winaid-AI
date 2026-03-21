import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Vercel에서 US East (iad1) 리전 기본 사용
  // serverless functions는 vercel.json에서 설정

  // 기존 Vite 프로젝트의 src/ 컴포넌트를 참조하기 위한 설정
  // 마이그레이션 완료 후 제거
  transpilePackages: [],

  // 환경 변수 (NEXT_PUBLIC_ 접두사로 전환 예정)
  env: {
    // 마이그레이션 중 기존 VITE_ 변수와 호환
  },
};

export default nextConfig;
