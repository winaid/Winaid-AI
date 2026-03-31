# 배포 전 체크리스트

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

## 모바일 확인
- [ ] 모바일 헤더 탭 네비게이션 동작
- [ ] 모바일 로그아웃 드롭다운 동작

## 환경변수 확인
- [ ] NEXT_PUBLIC_SUPABASE_URL 설정됨
- [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY 설정됨
- [ ] GEMINI_API_KEY 설정됨
- [ ] (선택) GEMINI_API_KEY_2, _3 설정됨
- [ ] (선택) NEXT_PUBLIC_CRAWLER_URL 설정됨
- [ ] (선택) CRON_SECRET 설정됨

## 최근 변경사항 (2026-03-27)
- 블로그 생성 후 SEO 상세 분석 패널 추가
- blog/page.tsx 컴포넌트 분리 (BlogFormPanel, BlogResultArea, blogConstants, normalizeBlog)
- categoryTemplates(204KB) 동적 import로 번들 최적화
- 보도자료/AI 보정 빈 상태 UI 개선
- 랜딩 챗봇 세션당 10회 API 호출 제한
- 버그 수정: 무한 로딩, Math.random() 점수, 모바일 로그아웃, 제목 추출
- 안정성 강화: API 입력 검증, 에러 방어, 더블클릭 방지, 메모리 누수 수정
- 의료광고법 검증 패턴 14개 카테고리로 확장 + AI 심층 검증
- 글쓰기 스타일 학습 의료 특화 5개 항목 추가
- 관리자 대시보드 CSV 내보내기
- cron 엔드포인트 CRON_SECRET 필수화

## 배포 후 확인
- [ ] Vercel 빌드 로그에서 에러 없음
- [ ] Preview URL에서 /auth → /blog → /history 플로우 동작
- [ ] /api/gemini 헬스체크 → `{"status":"ok","keys":N}`
- [ ] 모바일 브라우저에서 기본 동작 확인
