# WINAID — 병원 AI 콘텐츠 생성 플랫폼

병원/치과/피부과 등 의료기관을 위한 AI 콘텐츠 자동 생성 SaaS입니다.
블로그, 카드뉴스, 보도자료, 이미지를 AI로 생성하고, 의료광고법 준수를 자동 검토합니다.

## 주요 기능

- **블로그 생성** — SEO 최적화된 의료 블로그 글 자동 작성 (5단계 AI 파이프라인)
- **카드뉴스 생성** — 멀티슬라이드 카드뉴스 + AI 이미지 자동 생성
- **보도자료 생성** — 기자 문체의 전문 보도자료 자동 작성
- **콘텐츠 다듬기** — 기존 글을 AI로 교정/요약/톤 변경
- **이미지 생성** — Gemini 기반 의료 전문 이미지 생성
- **히스토리** — 생성한 콘텐츠 저장/관리/내보내기 (Word/PDF)

## 기술 스택

- **프레임워크**: Next.js 16 + React 19 + TypeScript
- **스타일링**: Tailwind CSS 4
- **데이터베이스**: Supabase (PostgreSQL + Auth)
- **AI 엔진**: Google Gemini API
- **배포**: Vercel

## 빠른 시작

```bash
# 의존성 설치
npm install

# 환경변수 설정
cp .env.example .env.local
# .env.local을 실제 값으로 수정

# 개발 서버 실행
npm run dev
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | O | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | O | Supabase Anonymous Key |
| `GEMINI_API_KEY` | O | Google Gemini API 키 |
| `GEMINI_API_KEY_2` | - | 백업 Gemini 키 (로테이션) |
| `GEMINI_API_KEY_3` | - | 백업 Gemini 키 (로테이션) |

## 데이터베이스 설정

Supabase 프로젝트 생성 후, `sql/public_app_setup.sql`을 SQL Editor에서 실행하세요.

## 프로젝트 구조

```
public-app/
├── app/
│   ├── (dashboard)/        # 대시보드 (로그인 필요)
│   │   ├── app/            # 메인 워크스페이스
│   │   ├── blog/           # 블로그 생성
│   │   ├── card_news/      # 카드뉴스 생성
│   │   ├── press/          # 보도자료 생성
│   │   ├── refine/         # 콘텐츠 다듬기
│   │   ├── image/          # 이미지 생성
│   │   └── history/        # 히스토리
│   ├── auth/               # 로그인/회원가입
│   └── api/
│       ├── gemini/         # Gemini 텍스트 생성
│       └── image/          # Gemini 이미지 생성
├── components/             # 재사용 UI 컴포넌트
├── hooks/                  # 커스텀 훅
├── lib/                    # 서비스/유틸리티
└── sql/                    # 데이터베이스 초기 SQL
```

## 배포

```bash
# Vercel에 배포
vercel

# 또는 빌드 후 수동 배포
npm run build
npm start
```

## 라이선스

Private — All rights reserved.
