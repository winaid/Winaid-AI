# E2E 검증 런북

## 월요일 체크 순서 (요약)

```
1. .env.local 세팅 (ENV_SETUP.md 참고)
2. npm run dev
3. /auth → 로그인 성공
4. /blog → 생성 → 저장 확인
5. /history → 목록 확인 → 상세 → 필터 탭
6. /card_news, /press, /refine 순차 검증
```

---

## 사전 준비

### env 세팅

> 상세: [ENV_SETUP.md](./ENV_SETUP.md)

```bash
cd next-app
cp .env.example .env.local
# 실제 값 채우기:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   GEMINI_API_KEY
```

### 서버 시작

```bash
npm run dev
# http://localhost:3000 접속 확인
```

### API 헬스체크

```bash
# Gemini 키 확인 — keys > 0 이면 OK
curl http://localhost:3000/api/gemini
# → {"status":"ok","keys":1,...}
```

---

## 검증 단계

### 1. /auth — 로그인

| 항목 | 확인 방법 |
|------|----------|
| 페이지 로드 | `/auth` 접속 → 로그인 폼 표시 |
| 로그인 | 팀 선택 → 이름/비밀번호 입력 → 로그인 |
| 성공 기준 | `/app` 대시보드로 리다이렉트 |
| 실패 시 | 브라우저 콘솔 → Supabase 에러 메시지 확인 |

> 계정이 없으면 "회원가입" 탭에서 먼저 생성

### 2. /blog — 블로그 생성

| 항목 | 확인 방법 |
|------|----------|
| 페이지 로드 | `/blog` 접속 → 입력 폼 표시 |
| 생성 | 주제 입력 → 옵션 선택 → 생성 버튼 |
| 성공 기준 | 생성 결과가 화면에 표시됨 |
| 저장 확인 | 결과 하단에 "저장 완료" 또는 에러 없음 |
| 실패 시 확인 | (1) 네트워크 탭에서 `/api/gemini` 응답 확인 (2) 콘솔에서 `[postStorage]` 에러 확인 |

### 3. /history — 목록 확인

| 항목 | 확인 방법 |
|------|----------|
| 페이지 로드 | `/history` 접속 → 목록 표시 |
| 방금 저장한 글 | 목록 최상단에 방금 생성한 블로그 표시 |
| 상세 보기 | 항목 클릭 → 제목, 본문, 키워드 확인 |
| 목록 복귀 | "목록으로" 버튼 → 목록 복귀 |
| 실패 시 확인 | (1) 에러 UI에 표시된 메시지 (2) 네트워크 탭 Supabase 쿼리 응답 |

### 4. /history — 필터 탭

| 항목 | 확인 방법 |
|------|----------|
| 탭 표시 | 목록 상단에 전체/블로그/카드뉴스/보도자료/AI 보정 탭 |
| 각 탭 카운트 | 탭 옆에 해당 유형 건수 표시 |
| 블로그 탭 | 클릭 → `post_type=blog` + `workflow_type≠refine`만 표시 |
| AI 보정 탭 | 클릭 → `workflow_type=refine`만 표시 |
| 빈 탭 | 데이터 없는 탭 클릭 → "해당 유형의 이력이 없습니다" 표시 |
| 전체 탭 복귀 | "전체" 클릭 → 모든 항목 복귀 |

### 5. /card_news — 카드뉴스 생성

| 항목 | 확인 방법 |
|------|----------|
| 생성 | 주제 입력 → 생성 → 결과 표시 |
| 저장 확인 | `/history` → 카드뉴스 탭에 표시 |

### 6. /press — 보도자료 생성

| 항목 | 확인 방법 |
|------|----------|
| 생성 | 주제 입력 → 생성 → 결과 표시 |
| 저장 확인 | `/history` → 보도자료 탭에 표시 |

### 7. /refine — AI 보정

| 항목 | 확인 방법 |
|------|----------|
| 보정 | 원문 붙여넣기 → 보정 모드 선택 → 보정 |
| 저장 확인 | `/history` → AI 보정 탭에 표시 |
| 구분 확인 | 블로그 탭에는 표시되지 않음 (refine은 별도 분류) |

---

## 실패 시 디버깅 순서

```
1. 브라우저 UI — 에러 메시지가 표시되는가?
2. 브라우저 콘솔 — JS 에러/경고 확인
3. 네트워크 탭 — /api/gemini 요청/응답 확인
4. 네트워크 탭 — Supabase REST 요청/응답 확인
5. 터미널 — Next.js 서버 로그에 에러 출력 확인
```

| 증상 | 원인 가능성 | 확인 |
|------|-----------|------|
| /auth에서 "서비스 준비 중" | Supabase env 누락 | `.env.local` 확인 |
| 생성 결과 안 나옴 | Gemini 키 누락/만료 | `curl /api/gemini` 헬스체크 |
| 생성은 되는데 저장 안 됨 | Supabase 키/테이블 문제 | 콘솔 `[postStorage]` 에러 |
| /history 빈 목록 | 저장 실패 또는 user_id 불일치 | Supabase 대시보드에서 `generated_posts` 직접 조회 |
| 필터 탭 안 보임 | 데이터가 0건 | 전체 탭에서 먼저 데이터 존재 확인 |

---

## known limitations (미검증 항목)

- `/image` — stub 상태, 이관 미완료
- `/admin` — stub 상태
- 네이버/구글 외부 API — route 미생성 (`MIGRATION_MAP.md` 참고)
- 다크모드 — 미착수
- 에러 바운더리 (`error.tsx`) — 미착수
- Vercel 배포 환경 — 로컬 검증 후 별도 확인 필요
- 모바일 레이아웃 — 기본 반응형만 적용, 세밀한 확인 필요

---

## 참고 문서

- [ENV_SETUP.md](./ENV_SETUP.md) — env 변수 상세 및 세팅 방법
- [MIGRATION_MAP.md](./MIGRATION_MAP.md) — Vite→Next.js 전환 매핑 전체 현황
