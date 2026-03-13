import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { resolve } from 'path'

// 빌드 시 Gemini API 키 존재 여부 확인 (Cloudflare Pages 빌드 로그용)
const geminiKey1 = process.env.VITE_GEMINI_API_KEY || '';
const geminiKey2 = process.env.VITE_GEMINI_API_KEY_2 || '';
const geminiKey3 = process.env.VITE_GEMINI_API_KEY_3 || '';
console.log(`[Build] VITE_GEMINI_API_KEY: ${geminiKey1 ? '✅ 있음 (' + geminiKey1.slice(0,8) + '...)' : '❌ 없음'}`);
console.log(`[Build] VITE_GEMINI_API_KEY_2: ${geminiKey2 ? '✅ 있음' : '⬜ 없음'}`);

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
    drop: ['console', 'debugger'],
  },
  plugins: [
    react(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ]
})
