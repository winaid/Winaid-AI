# 배포 전 체크리스트 (next-app 내부 도구용)

> ⚠️ 이 체크리스트는 **내부 운영 도구(next-app)** 기준입니다. 고객이 쓰는 외부 앱은 [`public-app/README.md`](../public-app/README.md)를 참고하세요.

## 빌드 검증
- [ ] `npm run build` 에러 없음
- [ ] `npm run lint` (tsc --noEmit) 타입 에러 없음

## 핵심 기능 동작 확인
- [ ] /auth — 로그인/회원가입
- [ ] /blog — 생성 → SEO 상세 분석 패널 → 저장
- [ ] /press — 빈 상태 UI → 생성
- [ ] /card_news — 생성
- [ ] /image — 카테고리 템플릿 로드 → 생성
- [ ] /refine — 빈 상태 UI → 자동 보정 + 채팅 모드
- [ ] /history — 저장된 글 목록 + 필터 탭
- [ ] /admin — 관리자 대시보드 로드
- [ ] /influencer, /clinical, /strengths, /youtube, /feedback — 내부 운영 기능

## 모바일 확인
- [ ] 모바일 헤더 탭 네비게이션 동작
- [ ] 모바일 로그아웃 드롭다운 동작

## 환경변수 확인
- [ ] `NEXT_PUBLIC_SUPABASE_URL` 설정됨
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` 설정됨
- [ ] `GEMINI_API_KEY` 설정됨
- [ ] (선택) `GEMINI_API_KEY_2`, `_3` 설정됨
- [ ] (선택) `NEXT_PUBLIC_CRAWLER_URL` 설정됨
- [ ] (선택) `CRON_SECRET` 설정됨

## 배포 후 확인
- [ ] Vercel 빌드 로그에서 에러 없음
- [ ] Preview URL에서 /auth → /blog → /history 플로우 동작
- [ ] /api/gemini 헬스체크 → `{"status":"ok","keys":N}`
- [ ] 모바일 브라우저에서 기본 동작 확인

---

## 최근 변경사항

이 체크리스트는 `next-app` 전용입니다. 전체 프로젝트의 최근 변경사항(Day 1~6 + AI 쇼츠 제거 등)은 [루트 CHANGELOG.md](../CHANGELOG.md)를 참고하세요.

### 2026-03-27 (next-app)
- 블로그 생성 후 SEO 상세 분석 패널 추가
- `blog/page.tsx` 컴포넌트 분리 (`BlogFormPanel`, `BlogResultArea`, `blogConstants`, `normalizeBlog`)
- `categoryTemplates`(204KB) 동적 import로 번들 최적화
- 보도자료/AI 보정 빈 상태 UI 개선
- 랜딩 챗봇 세션당 10회 API 호출 제한
- 의료광고법 검증 패턴 14개 카테고리로 확장 + AI 심층 검증
- 관리자 대시보드 CSV 내보내기
- cron 엔드포인트 `CRON_SECRET` 필수화
