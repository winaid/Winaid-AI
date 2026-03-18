# RUNBOOK.md — Hospital-AI 로컬 실행 / 빌드 / 배포 가이드

> 마지막 업데이트: 2026-03-18

## 로컬 실행

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local에 아래 필수 값 입력:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...
#   VITE_GEMINI_PROXY_URL=... (Gemini 프록시 URL)

# 3. 개발 서버 시작
npm run dev
# → http://localhost:5173
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `VITE_SUPABASE_URL` | **필수** | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | **필수** | Supabase anon key |
| `VITE_GEMINI_PROXY_URL` | **필수** | Gemini API 프록시 URL |
| `VITE_NAVER_CLIENT_ID` | 선택 | 네이버 검색 API (유사도 검사) |
| `VITE_NAVER_CLIENT_SECRET` | 선택 | 네이버 검색 API |

> 환경변수 상세: `docs/setup/.env.local.README.md` 참고

## 빌드

```bash
npm run build
# → dist/ 디렉토리에 정적 파일 생성
# → 번들 크기 확인은 빌드 출력에서 자동 표시
```

## 테스트

```bash
# 전체 테스트 실행
npx vitest run

# watch 모드
npx vitest

# 특정 파일
npx vitest run src/services/__tests__/resultAssembler.test.ts
```

현재 테스트: **9파일, 110개 테스트 케이스**

## 필수 외부 서비스

| 서비스 | 용도 | 필수 여부 |
|--------|------|-----------|
| **Supabase** | 인증, DB, 스토리지 | 필수 |
| **Gemini API** (프록시 경유) | 콘텐츠 생성 | 필수 |
| Naver Search API | 유사도 검사 | 선택 |
| Cloudflare Workers | Gemini 프록시 | 필수 (프록시) |

## Supabase 설정

```bash
# 초기 셋업
psql < sql/setup/supabase_FULL_SETUP.sql

# 마이그레이션 (필요 시)
ls sql/migrations/
# → 파일명에 기능명이 포함되어 있으므로 필요한 것만 실행
```

## 배포

### Vercel (프론트엔드)
```bash
# Vercel에 자동 배포 설정 시:
# - Build Command: npm run build
# - Output Directory: dist
# - Framework Preset: Vite
```

### Cloudflare Workers (Gemini 프록시)
```bash
# wrangler.toml 또는 wrangler.jsonc 설정 참고
cd vercel-proxy  # 또는 프록시 디렉토리
wrangler deploy
```

## 배포 전 점검 항목

- [ ] `npm run build` 성공
- [ ] `npx vitest run` 전체 통과
- [ ] 환경변수 모두 설정 확인
- [ ] Supabase 연결 확인
- [ ] Gemini 프록시 연결 확인
- [ ] 블로그 생성 동작 확인
- [ ] 카드뉴스 생성 동작 확인
- [ ] 로그인/로그아웃 동작 확인
