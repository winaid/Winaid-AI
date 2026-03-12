// Cloudflare Pages Functions 타입 정의
interface Env {
  API_KEYS: KVNamespace;
  CONTENT_KV: KVNamespace;
  APP_PASSWORD?: string; // deprecated — 비밀번호 인증 제거됨
}

type PagesFunction<Env = any> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
  waitUntil: (promise: Promise<any>) => void;
  next: () => Promise<Response>;
  data: Record<string, any>;
}) => Response | Promise<Response>;
