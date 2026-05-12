# Phase B 후속 작업 — GEO/AEO 진단 lib drift 동기화

> Phase A 완료 직후 (2026-05-12) 작성. **prod 점수·우선조치 변동 가능** → 별도 PR + 롤백 플랜 필수.

## 배경

Phase A(이번 PR) 에서 `next-app` ↔ `public-app` 의 GEO/AEO 진단 페이지 **UI 패리티**만 맞췄다.
실제 측정/스코어링 로직(`lib/diagnostic/*`) 은 그대로 drift 가 남아 있어, public-app 의 점수·항목은
2026-05-08 이전 스냅샷 그대로다.

Phase A 머지 시 새로 활성화되는 기능:
- 공유 링크 생성 버튼 (hero)
- 코드 스니펫 탭 (`fail/warning` 항목 자동 코드 생성)
- 자동 경쟁사 추천 카드 (actions 탭, AI 실측 완료 후)
- `availableQueries` prop 폴백 — 응답에 필드 없으면 단일 입력 모드로 graceful fallback

Phase A 머지 시 **활성화되지 않는 기능** (Phase B 대상):
- Phase 3 다중쿼리 드롭다운 — `result.availableQueries` 가 응답에 없어 UI 숨김
- Phase 1 신규 검사 18종 (canonical, favicon, og_bundle, twitter_card, charset_utf8,
  csp_header, hsts_header, x_frame_header, x_content_type_header, referrer_policy_header,
  medical_law_compliance, title_length, keyword_density, heading_hierarchy,
  paragraph_structure, html_size, doctype, response_status)
- crawler.ts SSL bypass / BOT_BLOCKED / DNS / TIMEOUT 세분화 에러 분류

## Phase B 작업 범위 (참고용 체크리스트)

| 파일 | 변경 | 영향도 |
|---|---|---|
| `public-app/lib/diagnostic/scoring.ts` | LABELS / WEIGHTS / ROOT_CAUSES 18개 LABEL 확장 (next-app +14.5KB) | ⚠️ 점수 변동 |
| `public-app/lib/diagnostic/actionPlan.ts` | 18개 신규 LABEL 에 대응하는 action plan 텍스트 (next-app +18.5KB) | ⚠️ 우선조치 텍스트 변동 |
| `public-app/lib/diagnostic/crawler.ts` | SSL bypass agent, insecure HTTPS fallback, 30s 타임아웃, Phase 1 측정 항목 (next-app +8KB) | ⚠️ 측정 가능 항목 변동 + SSRF 보호선 재검증 필요 |
| `public-app/lib/diagnostic/discovery.ts` | `buildDiscoveryQueries` 함수 추가 (4패턴 멀티쿼리) | 응답에 `availableQueries` 채워지면서 드롭다운 활성화 |
| `public-app/app/api/diagnostic/route.ts` | `buildDiscoveryQueries` 호출 결과를 응답에 포함, 세분화 에러 분류 | API 응답 스키마 확장 (backward-compatible) |
| `public-app/app/api/diagnostic/stream/route.ts` | `queryId` body 파라미터 처리 | 멀티쿼리 활성화 |

⚠️ **`gateDiagnosticRequest` (게스트 IP rate limit) 는 next-app `checkAuth` 로 교체하지 말 것**
— public-app 은 게스트 흐름이 핵심이므로 기존 게이트를 유지.

## 권장 PR 분할

Phase B 자체도 한 PR 에 다 넣으면 무엇이 점수 변동을 일으켰는지 추적이 어려움. 추천 분할:

1. **B-1**: `crawler.ts` (측정 시작점만 강화) — 점수 영향 없음, 안전망 증가
2. **B-2**: `discovery.ts buildDiscoveryQueries` + `route.ts` 응답 확장 + `stream/route.ts queryId` — 멀티쿼리 활성화 (점수 영향 없음, UI 활성화만)
3. **B-3**: `scoring.ts` + `actionPlan.ts` Phase 1 확장 — **prod 점수·우선조치 변동**. 머지 전 staging 에서 대표 URL 10개 점수 비교 + 갑작스러운 큰 변동 없는지 확인 후 진행. 롤백 = revert.

## prod 영향 추정 (B-3 한정)

- 신규 18개 LABEL 이 모두 fail 인 사이트는 가산 감점이 크므로 종합 점수가 **5~15점 하락** 가능
- 기존 결과 캐시(`diagnostic_history` 테이블) 는 그대로 보존됨 — 새 진단부터 새 점수
- 사용자 입장: "점수가 갑자기 떨어졌다" 보일 수 있음. UI 에서 변경 안내 banner 1회 노출 검토

## 검증 포인트 (B 작업 시)

- [ ] `npm run lint` + `npm run build` 양 앱 통과
- [ ] dev 서버에서 `/diagnostic` 직접 URL 입력 → 신규 LABEL 들이 측정·표시되는지
- [ ] dev 서버에서 멀티쿼리 드롭다운 실제 노출 + 4패턴 쿼리 동작
- [ ] `/check/[token]` 공유 페이지가 새 view 필드들도 정상 표시
- [ ] staging 환경에서 winai.kr / 대표 파트너 병원 10곳 진단 후 점수 비교 (B-3 만)
