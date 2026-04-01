# WINAID — 병원 마케팅 AI 콘텐츠 플랫폼

의료광고법을 준수하는 병원 블로그·보도자료·카드뉴스·이미지를 AI로 자동 생성하는 SaaS 제품.

## 기술 스택

| 구성 | 기술 |
|------|------|
| 프론트엔드 | Next.js 16 + React 19 + Tailwind CSS 4 |
| 백엔드/DB | Supabase (PostgreSQL + Auth + Storage) |
| AI 엔진 | Google Gemini API (텍스트 + 이미지) |
| 크롤러 | Node.js + Express + Puppeteer (별도 서버) |
| 배포 | Vercel (next-app) + Railway (crawler-server) |

## 주요 기능

- **블로그 생성** — 5단계 AI 파이프라인 (초안 → AI냄새제거 → SEO → 의료법검증 → 최종)
- **보도자료 생성** — 병원 웹사이트 분석 + 3인칭 기사체 작성
- **카드뉴스 생성** — 다슬라이드 카드뉴스 원고 + 디자인 템플릿
- **AI 이미지 생성** — 캘린더, 포스터, 배너 등 8가지 카테고리
- **AI 보정(Refine)** — 자동 보정 6종 + 채팅 모드
- **글쓰기 스타일 학습** — 병원 블로그 크롤링 → Gemini 분석 → 문체 프로파일
- **의료광고법 검증** — 패턴 기반 + AI 심층 검증
- **네이버 키워드 분석** — 검색량/블로그수/포화도
- **히스토리** — Supabase + localStorage 이중 저장
- **관리자 대시보드** — 통계, 콘텐츠/사용자/피드백 관리, CSV 내보내기

## 프로젝트 구조

```
Winaid-AI/
├── next-app/                    # 메인 웹 앱 (Next.js)
│   ├── app/
│   │   ├── page.tsx             # 랜딩 페이지
│   │   ├── auth/page.tsx        # 로그인/회원가입
│   │   ├── admin/page.tsx       # 관리자 대시보드
│   │   ├── (dashboard)/         # 대시보드 라우트 그룹
│   │   │   ├── app/page.tsx     # 대시보드 홈
│   │   │   ├── blog/page.tsx    # 블로그 생성
│   │   │   ├── press/page.tsx   # 보도자료 생성
│   │   │   ├── card_news/       # 카드뉴스 생성
│   │   │   ├── image/page.tsx   # 이미지 생성
│   │   │   ├── refine/page.tsx  # AI 보정
│   │   │   └── history/page.tsx # 히스토리
│   │   └── api/
│   │       ├── gemini/route.ts  # Gemini API 프록시 (멀티키 로테이션)
│   │       ├── image/route.ts   # 이미지 생성 API
│   │       └── naver/           # 네이버 검색/크롤링 API
│   ├── components/              # UI 컴포넌트
│   ├── lib/                     # 프롬프트 빌더, 서비스 로직
│   └── hooks/                   # useAuthGuard 등
├── crawler-server/              # 네이버 블로그 크롤러 (Express + Puppeteer)
├── sql/                         # Supabase 마이그레이션
│   ├── setup/                   # 초기 설정 SQL
│   └── migrations/              # 증분 마이그레이션
└── supabase/                    # 스키마 참조
```

## 빠른 시작

```bash
# 1. 의존성 설치
cd next-app && npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local에 실제 값 입력:
#   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
#   GEMINI_API_KEY=your_gemini_key

# 3. 개발 서버 실행
npm run dev
# http://localhost:3000 에서 확인
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 | Supabase anon key |
| `GEMINI_API_KEY` | 필수 | Google Gemini API 키 |
| `GEMINI_API_KEY_2` | 선택 | 백업 키 (로테이션) |
| `GEMINI_API_KEY_3` | 선택 | 백업 키 (로테이션) |
| `NEXT_PUBLIC_CRAWLER_URL` | 선택 | 크롤러 서버 URL (말투 학습용) |
| `CRON_SECRET` | 선택 | Vercel Cron 인증 토큰 |

## 배포

### next-app (Vercel)

1. GitHub 리포지토리를 Vercel에 연결
2. Root Directory: `next-app`
3. 환경변수 설정 (위 표 참고)
4. 배포 완료

### crawler-server (Railway)

1. `crawler-server/` 디렉토리를 Railway에 배포
2. Docker 빌드 자동 감지
3. 환경변수: `ALLOWED_ORIGINS`, `PORT`

## DB 초기 설정

Supabase SQL Editor에서 실행:
1. `sql/setup/supabase_FULL_SETUP.sql` — 전체 스키마 생성
2. `sql/migrations/2026-03-24_dynamic_team_hospitals.sql` — 팀/병원 데이터

## 개발 명령어

```bash
npm run dev    # 개발 서버
npm run build  # 프로덕션 빌드
npm run lint   # TypeScript 타입 체크
```

## 라이선스

Private — 비공개 프로젝트

---
마지막 업데이트: 2026-03-26
