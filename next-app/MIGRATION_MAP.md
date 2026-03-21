# Vite → Next.js App Router 마이그레이션 매핑

## 라우트 매핑

| Vite 경로 | Next.js 파일 | 원본 컴포넌트 | 상태 |
|-----------|-------------|-------------|------|
| `/` | `app/page.tsx` | `src/components/LandingPage.tsx` | stub |
| `/auth` | `app/auth/page.tsx` | `src/components/AuthPage.tsx` | **done** |
| `/app` | `app/(dashboard)/app/page.tsx` | `src/components/HomeDashboard.tsx` | **done** |
| `/blog` | `app/(dashboard)/blog/page.tsx` | `GenerateWorkspace(blog)` | **done** (입력→API→결과표시) |
| `/card_news` | `app/(dashboard)/card_news/page.tsx` | `GenerateWorkspace(card_news)` | **done** (입력→생성→저장) |
| `/press` | `app/(dashboard)/press/page.tsx` | `GenerateWorkspace(press)` | **done** (입력→생성→저장) |
| `/refine` | `app/refine/page.tsx` | `src/components/ContentRefiner.tsx` | stub |
| `/image` | `app/image/page.tsx` | `src/components/ImageGenerator.tsx` | stub |
| `/history` | `app/(dashboard)/history/page.tsx` | `src/components/PostHistory.tsx` | **done** (목록+상세) |
| `/admin` | `app/admin/page.tsx` | `src/components/AdminPage.tsx` | stub |

## API 매핑

| 기존 경로 | Next.js 파일 | 상태 |
|-----------|-------------|------|
| `api/gemini.js` | `app/api/gemini/route.ts` | stub (health only) |
| `api/naver-news.js` | `app/api/naver-news/route.ts` | 미생성 |
| `api/google/search.js` | `app/api/google/search/route.ts` | 미생성 |
| `api/naver/keyword-stats.js` | `app/api/naver/keyword-stats/route.ts` | 미생성 |
| `api/naver/search.js` | `app/api/naver/search/route.ts` | 미생성 |
| `api/naver/crawl-search.js` | `app/api/naver/crawl-search/route.ts` | 미생성 |
| `api/naver/crawl-hospital-blog.js` | `app/api/naver/crawl-hospital-blog/route.ts` | 미생성 |
| `api/naver/crawl-top-blog.js` | `app/api/naver/crawl-top-blog/route.ts` | 미생성 |
| `api/medical-law/updates.js` | `app/api/medical-law/updates/route.ts` | 미생성 |
| `api/medical-law/fetch.js` | `app/api/medical-law/fetch/route.ts` | 미생성 |
| `api/crawler.js` | `app/api/crawler/route.ts` | 미생성 |
| `api/auth/verify.js` | `app/api/auth/verify/route.ts` | 미생성 |
| `api/web-search/search.js` | `app/api/web-search/search/route.ts` | 미생성 |

## 공유 인프라 전환

| 항목 | Vite 방식 | Next.js 방식 | 비고 |
|------|----------|-------------|------|
| 전역 CSS | `src/index.css` | `app/globals.css` | 완료 (기본만) |
| 레이아웃 | `App.tsx` Sidebar+MobileHeader | `app/app/layout.tsx` | stub |
| 인증 | `useAuth` hook + AuthContext | 서버 미들웨어 or Client Provider | 미착수 |
| 환경변수 | `VITE_*` (빌드시), `process.env` (런타임) | `NEXT_PUBLIC_*` (클라이언트), `process.env` (서버) | 전환 필요 |
| 라우팅 | `useRouting` 수동 pushState | Next.js file-based routing | 구조 완료 |
| 다크모드 | localStorage + class toggle | 동일 (Client Component) | 미착수 |
| 에러 바운더리 | `ErrorBoundary` component | `error.tsx` per route | 미착수 |

## 환경변수 전환 매핑

| Vite (현재) | Next.js (전환 후) |
|------------|------------------|
| `VITE_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `VITE_GEMINI_PROXY_URL` | `NEXT_PUBLIC_GEMINI_PROXY_URL` |
| `VITE_MAINTENANCE_MODE` | `NEXT_PUBLIC_MAINTENANCE_MODE` |
| `VITE_GEMINI_API_KEY` | `NEXT_PUBLIC_GEMINI_API_KEY` (또는 제거) |
| `GEMINI_API_KEY` | `GEMINI_API_KEY` (변경 없음) |
| `SUPABASE_*` | `SUPABASE_*` (변경 없음) |
| `NAVER_*` | `NAVER_*` (변경 없음) |
| `GOOGLE_*` | `GOOGLE_*` (변경 없음) |
