import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { Plugin } from 'vite'

// 빌드 시 Gemini API 키 존재 여부 확인 (Cloudflare Pages 빌드 로그용)
const geminiKey1 = process.env.VITE_GEMINI_API_KEY || '';
const geminiKey2 = process.env.VITE_GEMINI_API_KEY_2 || '';
const geminiKey3 = process.env.VITE_GEMINI_API_KEY_3 || '';

// 빌드 버전 (배포 확인용 — UI에 표시)
const buildHash = new Date().toISOString().slice(0,16).replace(/[-T:]/g, '') + '-' + Math.random().toString(36).slice(2,6);
console.log(`[Build] BUILD_HASH: ${buildHash}`);
console.log(`[Build] VITE_GEMINI_API_KEY: ${geminiKey1 ? '✅ 있음 (' + geminiKey1.slice(0,8) + '...)' : '❌ 없음'}`);
console.log(`[Build] VITE_GEMINI_API_KEY_2: ${geminiKey2 ? '✅ 있음' : '⬜ 없음'}`);

/**
 * sw.js 내 __SW_BUILD_HASH__ 플레이스홀더를 빌드 해시로 치환하는 플러그인.
 * 매 빌드마다 서비스 워커의 캐시 버전이 자동 갱신되어,
 * 배포 시 구 캐시가 확실히 무효화됩니다.
 */
function swVersionPlugin(): Plugin {
  return {
    name: 'sw-version-inject',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      try {
        const content = readFileSync(swPath, 'utf-8');
        const updated = content.replace(/__SW_BUILD_HASH__/g, buildHash);
        writeFileSync(swPath, updated, 'utf-8');
        console.log(`[SW] Injected build hash ${buildHash} into sw.js`);
      } catch (e) {
        console.warn('[SW] Failed to inject build hash into sw.js:', e);
      }
    },
  };
}

// 클라이언트 전용 빌드 (SSR/Worker 제거)
export default defineConfig({
  server: {
    host: true, // 모든 네트워크 인터페이스에서 접근 허용
    allowedHosts: [
      '.sandbox.novita.ai',
      'localhost',
      '127.0.0.1'
    ]
  },
  // Cloudflare Pages에서 Vite env 로딩이 process.env를 못 읽는 문제 우회
  // import.meta.env.VITE_* 대신 전역 상수로 직접 주입
  define: {
    '__GEMINI_KEY_1__': JSON.stringify(geminiKey1),
    '__GEMINI_KEY_2__': JSON.stringify(geminiKey2),
    '__GEMINI_KEY_3__': JSON.stringify(geminiKey3),
    '__BUILD_HASH__': JSON.stringify(buildHash),
    '__GEMINI_PROXY_URL__': JSON.stringify(process.env.VITE_GEMINI_PROXY_URL || ''),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-google': ['@google/genai'],
          'vendor-utils': ['docx', 'file-saver', 'html2canvas'],
          'supabase': ['@supabase/supabase-js']
        }
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
    chunkSizeWarningLimit: 500,
    minify: 'esbuild',
    target: 'es2020',
    sourcemap: false,
  },
  esbuild: {
    // console.error/warn은 프로덕션에서 유지 (장애 추적용)
    // console.log/debug만 제거
    pure: ['console.log', 'console.debug'],
    drop: ['debugger'],
  },
  plugins: [
    react(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    }),
    swVersionPlugin(),
  ]
})
