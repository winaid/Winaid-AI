import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Tailwind CSS
import './index.css'

declare const __BUILD_HASH__: string;

// 빌드 버전 콘솔 출력 (console.info는 프로덕션에서도 유지됨)
console.info(
  `%c WINAID %c Build: ${typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'dev'} `,
  'background:#3b82f6;color:white;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px',
  'background:#1e293b;color:#94a3b8;padding:2px 6px;border-radius:0 3px 3px 0'
);

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<App />)
}

// Service Worker 등록은 index.html에서 처리 (이중 등록 방지)
