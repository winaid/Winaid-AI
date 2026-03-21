# 환경변수 세팅 가이드

## 빠른 시작

```bash
cd next-app
cp .env.example .env.local
# .env.local을 열고 실제 값으로 교체
npm run dev
```

## 필수 환경변수 (3개)

| 변수 | 용도 | 어디서 얻나 |
|------|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | [Supabase Dashboard](https://supabase.com/dashboard) → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명 키 | 같은 페이지 → anon/public key |
| `GEMINI_API_KEY` | Google Gemini API 키 | [Google AI Studio](https://aistudio.google.com/apikey) |

이 3개가 없으면:
- Supabase 키 누락 → 로그인/저장/히스토리 기능 사용 불가 (앱 자체는 시작됨)
- Gemini 키 누락 → 콘텐츠 생성 시 에러 (`[env] GEMINI_API_KEY 누락`)

## 선택 환경변수

| 변수 | 용도 |
|------|------|
| `GEMINI_API_KEY_2` | Gemini 백업 키 (멀티키 로테이션) |
| `GEMINI_API_KEY_3` | Gemini 백업 키 (멀티키 로테이션) |

## .env.local 예시

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=AIzaSy...
```

## 검증 방법

```bash
# 1. 서버 시작
npm run dev

# 2. Supabase 연결 확인 — 에러 없이 페이지 로드되면 OK
curl http://localhost:3000/auth

# 3. Gemini 키 확인 — keys > 0 이면 OK
curl http://localhost:3000/api/gemini
# → {"status":"ok","keys":1,...}

# 4. 생성 테스트
curl -X POST http://localhost:3000/api/gemini \
  -H "Content-Type: application/json" \
  -d '{"prompt":"안녕하세요"}'
# → {"text":"...","candidates":1}
```

## 참고

- `NEXT_PUBLIC_` 접두사가 있는 변수는 브라우저에 노출됨 (Supabase anon key는 원래 공개용)
- `GEMINI_API_KEY`는 서버 사이드에서만 사용 (브라우저에 노출 안 됨)
- `.env.local`은 `.gitignore`에 포함되어야 함 (이미 포함됨)
