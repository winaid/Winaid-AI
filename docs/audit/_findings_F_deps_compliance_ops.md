# Agent F — Dependencies + Compliance + Operability

검토: package.json 7/7, Dockerfile 3/3, .env.example 4/4, nixpacks.toml, SQL 스키마, docs

## 워크스페이스별 핵심 의존성 위험 요약
- **public-app/next-app**: Next ^16.2.1 (RC급, 2025-12), React ^19.2.4, Tailwind ^4.1.18 (메이저), `@anthropic-ai/sdk ^0.93.0` (0.x 빈번 breaking), `openai ^6.34.0` (코드 코멘트에 이슈 #1844 우회 플래그 명시), `@google/genai ^1.44.0`
- **crawler-server**: `puppeteer-core ^21.6.1` (구버전, 23.x 보안 패치 누적), `puppeteer-extra` 미유지, `yt-dlp` pip --upgrade로 빌드마다 다른 버전
- **video-processor**: `@google/generative-ai ^0.24.1` (deprecated, 신 SDK는 `@google/genai`), `multer ^1.4.5-lts.1` (1.x 메인터넌스 모드), `helmet ^7.x` drift
- **winai-blog-publisher**: `crypto-js ^4.2.0` (사실상 미유지, legacy decrypt만 잔존), `playwright ^1.45.0` ↔ public-app `^1.58.2` drift

## High

### [CMP-001] 개인정보처리방침/이용약관 페이지 부재 — PIPA 위반 소지
- 컴플라이언스 / High / `public-app/app` 트리에 privacy/terms/policy 디렉토리 없음
- 회원가입 폼이 약관/동의 없이 진행 — 개인정보보호법 제15조/22조
- 수정: /privacy, /terms 라우트 + 명시적 체크박스 (필수: 약관·개인정보, 선택: 마케팅) + 동의 시각·항목 DB 기록

### [CMP-002] 회원탈퇴 / 데이터 삭제 흐름 부재
- 컴플라이언스 / High / deleteAccount/withdraw/deactivate 부재
- 개인정보보호법 제36조(정정·삭제 요구권) / 제37조(처리정지) 미준수
- 수정: /mypage/withdraw + RPC delete_user_account SECURITY DEFINER

### [OPS-001] 모니터링/관측성 도구 0건
- 운영성 / High / 전체 모노레포
- Sentry / PostHog / OpenTelemetry / Datadog / NewRelic 어느 SDK도 import 안 됨
- production incident 인지 시간이 사용자 신고 의존
- 수정: 최소 Sentry 도입 + Slack webhook

### [OPS-010] CI / pre-commit / secret scanning 부재
- 운영성/보안 / High / `.github/workflows/`, `.husky/`, gitleaks 모두 부재
- API 키 실수 커밋 차단 메커니즘 없음, 의존성 자동 모니터링 부재
- 수정: GitHub Actions(npm audit, lint, test:e2e, gitleaks) + husky pre-commit

## Medium

### 의존성 (DEP)
- **DEP-001** puppeteer-core ^21.6.1 — 23.x 이후 보안 패치 누적, extra/stealth 미유지
- **DEP-002** multer 1.x — 메인터넌스 모드, 2.x 마이그 권장 (500MB 업로드 9개 라우트 영향)
- **DEP-003** `@google/generative-ai`(deprecated) ↔ `@google/genai` 두 SDK 혼재 (video-processor만 구 SDK)
- **DEP-004** Next 16 / React 19 / Tailwind 4 / openai 6 / anthropic 0.93 동시 운용 (RC급 stack), .env.example에 `OPENAI_IMAGE_EDIT_ENABLED=0` 우회 플래그 시인
- **DEP-007** yt-dlp `pip install --upgrade` — 핀 없음, 빌드 비재현성

### 컴플라이언스 (CMP)
- **CMP-003** 데이터 보관/파기 기간 명시 부재 — 개인정보보호법 제21조 미준수, api_usage_logs 무기한 보관
- **CMP-004** 임상 케이스 동의 — UI 체크박스는 있지만 DB 기록 없음 (clinical/page.tsx:50,322,439)
- **CMP-007** hospital_crawled_posts — 제3자 블로그 본문 평문 저장 + RLS public read, 저작권/정보통신망법 risk

### 운영성 (OPS)
- **OPS-002** Next 앱 자체 헬스체크 부재 — `/api/gemini` GET이 keys 카운트 노출
- **OPS-003** hospital-images/upload 에러 로깅에 stack 일부 포함 (응답에 포함 여부 추가 확인 필요)
- **OPS-006** video-processor `app.set('trust proxy')` 부재 (crawler-server는 있음)
- **OPS-007** PII userId 평문 로깅 12개 라우트 (image, generate/blog, blog/section, youtube, press, clinical × 양 앱) — usage_history와 결합용이성으로 PII 변환
- **OPS-008** Supabase 미설정 시 silent fallback (prod에서도 게스트 모드 진입)
- **OPS-009** 배포 순서 강제 메커니즘 없음 — PROCESSOR_SHARED_SECRET 불일치 시 모든 영상 처리 실패
- **OPS-011** Dockerfile 3개 모두 USER 디렉티브 부재 → root 실행 (Chromium --no-sandbox와 결합 시 위험)
- **OPS-016** /tmp 채움 — multer dest=os.tmpdir() 9개 라우트, cleanup 누락 시 디스크 풀
- **OPS-017** api_usage_logs.details JSONB — 입력 토큰/콘텐츠 단편 저장 가능, 화이트리스트 부재

## Low
- DEP-005 html2canvas 1.4.1 (next-app만, 메인터넌스 정지) → konva로 통일 또는 html-to-image 교체
- DEP-006 crypto-js — legacy v1 decrypt 경로에만 남음, 점진 제거
- DEP-008 @types/node drift (winai-blog-publisher ^20 vs public-app ^22)
- DEP-009 Playwright 두 버전 공존 (1.45 vs 1.58)
- DEP-010 helmet ^7 / uuid ^9 메이저 drift
- DEP-011 license 필드 부재 (대부분 package.json) → "UNLICENSED" 명시
- DEP-012 ffmpeg 시스템 바이너리 — THIRD_PARTY_NOTICES.md 부재 (전염 위험은 없음)
- DEP-013 typosquatting — 0건
- CMP-005 robots.txt / sitemap.xml 부재
- CMP-006 본인인증/PG 연동 코드 부재 (정보)
- OPS-004 crawler-server dev 에러에 stack 포함 — NODE_ENV 잘못 설정 시 prod 노출
- OPS-005 video-processor `/` 라우트가 service+version 노출 (Day 1에서 /health만 처리)
- OPS-012 Dockerfile FROM tag 무핀 (`:slim`)
- OPS-013 루트 Dockerfile + nixpacks.toml 둘 다 존재 — Railway 빌더 의도 불명확
- OPS-014 crawler-server 에러 핸들러 err 전체 객체 로깅
- OPS-015 video-processor apply-style stdout 풍부 로깅 (PII 없음)
- OPS-018 next-app /api/zdebug/* 라우트 잔존 (코드 주석 "진단 끝나면 삭제"인데 미삭제)
- SEC-001 crawler-server CRAWLER_SHARED_SECRET 부팅 진단에 length 출력
- SEC-002 Express body limit drift (video-processor 명시, crawler-server는 default)

## PII 수집 항목 (요약)
- auth.users.email, profiles.email/name/full_name/avatar_url, profiles.ip_hash — 평문/SHA256, 보관기간 명시 없음
- generated_posts.user_email/hospital_name/doctor_name/doctor_title — 사업자/의료인 PII, 평문
- hospital_style_profiles.hospital_name/naver_blog_url/raw_sample_text — 평문
- hospital_crawled_posts.url/content — 제3자 본문, 평문, public read
- 임상 케이스 글 (`/clinical`) — 환자 사진/사례, 동의 UI 있으나 DB 기록 없음
- winai-blog-publisher 네이버 ID/PW — `~/.winai-publisher/account_*.enc` (mode 0600), aes-256-gcm v2 + 무작위 키, legacy v1는 하드코딩 키

## 헬스체크/모니터링 현황
| 서버 | 헬스체크 | 모니터링 | 알림 |
|---|---|---|---|
| public-app | 부재 (/api/gemini GET이 ping 역할) | 없음 | 없음 |
| next-app | 부재 (/api/zdebug/* prod 차단됨) | 없음 | 없음 |
| video-processor | /health (인증 X, boolean), / (version 노출) | 없음 | 없음 |
| crawler-server | /health (인증 X, ytdlp/ffmpeg boolean) | 없음 | 없음 |
| winai-blog-publisher | 별도 health 부재 | 없음 | — |

CI 파이프라인 자체 부재 (`.github/workflows` 디렉토리 없음).

## 통계
| 카테고리 | High | Medium | Low | 합계 |
|---|---|---|---|---|
| 📦 의존성 | 0 | 5 | 8 | 13 |
| ⚖️ 컴플라이언스 | 2 | 3 | 2 | 7 |
| 📊 운영성 | 2 | 9 | 7 | 18 |
| 🔒 보안 (보조) | 0 | 0 | 2 | 2 |
| **합계** | **4** | **17** | **19** | **40** |

CHANGELOG 처리 여부: 40개 모두 **미처리**. Day 1~6 정비는 보안·메모리·API 방어에 집중, 의존성 drift / 컴플라이언스 / 모니터링 / CI / Dockerfile USER는 이번 검토에서 처음 식별된 사각지대.
