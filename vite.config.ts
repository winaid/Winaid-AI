import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { resolve } from 'path'

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
