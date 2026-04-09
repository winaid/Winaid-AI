const ts = () => new Date().toLocaleTimeString('ko-KR');

export const log = {
  info: (msg: string) => console.log(`[${ts()}] ℹ️  ${msg}`),
  success: (msg: string) => console.log(`[${ts()}] ✅ ${msg}`),
  warn: (msg: string) => console.log(`[${ts()}] ⚠️  ${msg}`),
  error: (msg: string) => console.error(`[${ts()}] ❌ ${msg}`),
  step: (msg: string) => console.log(`[${ts()}] 🔄 ${msg}`),
};
