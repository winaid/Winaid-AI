# Vercel 배포 런북

## 월요일 실행 순서 (요약)

```
1. 로컬 E2E 먼저 통과 (E2E_RUNBOOK.md)
2. Vercel 프로젝트 생성 → Root Directory: next-app
3. env 3개 등록 (Preview + Production)
4. Preview 배포 → /auth, /blog, /history, /api/gemini 확인
5. 문제 없으면 Production 배포 판단
```

---

## 1단계: 로컬 E2E 먼저 통과

Vercel 배포 전에 반드시 로컬에서 먼저 검증한다.

> 절차: [E2E_RUNBOOK.md](./E2E_RUNBOOK.md)

로컬에서 `/auth → /blog → 저장 → /history` 흐름이 동작하는지 확인 후 진행한다.

---

## 2단계: Vercel 프로젝트 생성/연결

### 신규 생성 시

1. [vercel.com/new](https://vercel.com/new) 접속
2. GitHub 리포 `Hospital-AI` 선택
3. **Root Directory** → `next-app` 입력
4. Framework Preset → `Next.js` (자동 감지됨)
5. Build and Output Settings — 기본값 사용:
   - Build Command: `npm run build` (= `next build`)
   - Output Directory: `.next` (자동)
   - Install Command: `npm install` (자동)
6. env 등록 (아래 3단계 참고) 후 Deploy 클릭

### 기존 프로젝트에 연결 시

1. Vercel 대시보드 → Settings → General
2. **Root Directory** 확인: `next-app` 으로 되어 있는지
3. Node.js Version: 18.x 이상 확인

> **핵심**: 리포 루트가 아니라 `next-app`이 Root Directory여야 한다. 그래야 `next-app/package.json` 기준으로 빌드된다.

---

## 3단계: env 등록

### Vercel 대시보드에서

Settings → Environment Variables

### 필수 (3개)

| 변수 | 환경 | 비고 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Preview + Production | 브라우저 노출 (공개 키) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Preview + Production | 브라우저 노출 (공개 키) |
| `GEMINI_API_KEY` | Preview + Production | 서버 전용 (노출 안 됨) |

### 선택

| 변수 | 환경 | 비고 |
|------|------|------|
| `GEMINI_API_KEY_2` | Preview + Production | 멀티키 로테이션용 |
| `GEMINI_API_KEY_3` | Preview + Production | 멀티키 로테이션용 |
| `NEXT_PUBLIC_CRAWLER_URL` | Preview + Production | 크롤러 서버 URL (말투 학습, 없으면 해당 기능 비활성) |
| `CRON_SECRET` | Production만 | Vercel Cron 인증 (/api/cron/crawl-all) |

### 등록 절차

1. Settings → Environment Variables
2. Key 입력 (예: `NEXT_PUBLIC_SUPABASE_URL`)
3. Value에 실제 값 붙여넣기
4. Environment 체크박스: **Preview** + **Production** 둘 다 체크
5. Add 클릭
6. 3개 반복

> env 값은 [ENV_SETUP.md](./ENV_SETUP.md) 참고

### 주의

- `NEXT_PUBLIC_` 접두사 변수는 빌드 시점에 번들에 포함됨 → env 변경 시 **재배포 필요**
- `GEMINI_API_KEY`는 서버 런타임 변수 → env 변경 후 재배포 없이도 적용될 수 있으나, 확실하게 하려면 재배포

---

## 4단계: Preview 배포 확인

### 배포 트리거

- env 등록 후 Vercel 대시보드에서 "Redeploy" 클릭
- 또는 `claude/technical-cofounder-product-*` 브랜치에 push 시 자동 Preview 배포

### 빌드 확인

1. Vercel 대시보드 → Deployments → 최신 배포 클릭
2. **Build Logs** 탭에서 에러 없이 완료 확인
3. `✓ Compiled successfully` 메시지 확인

### Preview URL 검증

배포 완료 후 Preview URL(예: `hospital-ai-xxx.vercel.app`)에서 아래 순서로 확인:

| 순서 | 경로 | 확인 항목 | 성공 기준 |
|------|------|----------|----------|
| 1 | `/` | 랜딩 페이지 로드 | 페이지 표시, JS 에러 없음 |
| 2 | `/api/gemini` | API 헬스체크 | `{"status":"ok","keys":1,...}` |
| 3 | `/auth` | 로그인 폼 | 폼 표시 ("서비스 준비 중" 아닌 것 확인) |
| 4 | `/auth` | 로그인 실행 | 로그인 → `/app` 리다이렉트 |
| 5 | `/blog` | 블로그 생성 | 주제 입력 → 결과 표시 |
| 6 | `/history` | 저장 확인 | 방금 생성한 글이 목록에 표시 |
| 7 | `/history` | 필터 탭 | 블로그 탭 클릭 → 필터 동작 |
| 8 | `/press` | 보도자료 생성 | 빈 상태 UI 표시 → 주제 입력 → 결과 표시 |
| 9 | `/refine` | AI 보정 | 빈 상태 UI 표시 → 텍스트 입력 → 보정 결과 |
| 10 | `/image` | 이미지 생성 | 카테고리 템플릿 로드(동적) → 선택 → 생성 |
| 11 | `/card_news` | 카드뉴스 | 주제 입력 → 결과 표시 |

---

## 5단계: 실패 시 디버깅

### 빌드 실패

| 증상 | 확인 위치 |
|------|----------|
| 빌드 에러 | Vercel → Deployments → Build Logs |
| 타입 에러 | 로컬에서 `npm run lint` (= `tsc --noEmit`) 먼저 확인 |
| 의존성 에러 | `next-app/package.json` 확인, 로컬 `npm ci` 재시도 |

### 런타임 에러

| 증상 | 원인 가능성 | 확인 |
|------|-----------|------|
| `/auth`에서 "서비스 준비 중" | `NEXT_PUBLIC_SUPABASE_*` env 누락 | Vercel Settings → Environment Variables |
| `/api/gemini`에서 500 에러 | `GEMINI_API_KEY` 누락 | Vercel Settings → Environment Variables |
| 생성은 되는데 저장 안 됨 | Supabase 키 또는 테이블 문제 | 브라우저 콘솔 + Supabase 대시보드 |
| `/history` 빈 목록 | 저장 실패 or user_id 불일치 | Supabase → `generated_posts` 테이블 직접 조회 |
| CORS 에러 | Supabase URL 불일치 | Supabase → Settings → API → Allowed Origins |

### 런타임 로그 확인

1. Vercel 대시보드 → Deployments → 해당 배포 → **Runtime Logs** 탭
2. 또는 Vercel 대시보드 → Logs (실시간)

---

## Launch 전 체크포인트

```
[ ] 로컬 E2E 통과
[ ] Vercel Preview 배포 성공 (빌드 에러 없음)
[ ] env 3개 정상 주입 확인
[ ] /auth 로그인 동작
[ ] /blog → 저장 → /history 확인
[ ] /history 필터 탭 동작
[ ] /press 빈 상태 + 생성 동작
[ ] /refine 빈 상태 + 보정 동작
[ ] /image 카테고리 템플릿 동적 로드 확인
[ ] /blog → SEO 상세 분석 패널 표시 확인
[ ] 모바일에서 로그아웃 드롭다운 동작
[ ] old 앱은 아직 제거하지 않음
[ ] Production 배포 여부는 Preview 통과 후 판단
```

---

## 참고 문서

- [ENV_SETUP.md](./ENV_SETUP.md) — env 변수 상세 및 세팅 방법
- [E2E_RUNBOOK.md](./E2E_RUNBOOK.md) — 로컬 E2E 검증 체크리스트
- [MIGRATION_MAP.md](./MIGRATION_MAP.md) — Vite→Next.js 전환 매핑 전체 현황
