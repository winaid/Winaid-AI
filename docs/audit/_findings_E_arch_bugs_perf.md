# Agent E — Architecture + Bugs + Performance + Quality

핵심 발견: **public-app과 next-app은 "쌍둥이"가 아니라 본질적으로 분기된 두 별도 앱**. lib drift는 점진적 정리가 아니라 분기를 인정하고 책임 분리를 명확히 해야 함.

## public-app vs next-app lib 중복 매핑 표

| 파일 | public-app | next-app | drift | master |
|---|---|---|---|---|
| auth.ts | 109 | 148 | 본질적 분기 (email/pw vs team-based) | 둘 다 (이름 분리 권장) |
| authFetch.ts | 21 | 25 | next-app만 credentials:'include' + admin HttpOnly | next-app |
| **sanitize.ts** | 36 | 11 | **🚨 next-app은 `<style>` 허용 + data: URI 허용 + SSR pass-through** | **public-app** (보안 우월) |
| sanitizeHtml.ts | (없음) | 103 | next-app에 sanitize.ts와 sanitizeHtml.ts 둘 다 공존 (정책 불일치) | 단일화 필요 |
| cardAiActions.ts | 866 | 406 | 543 lines diff (public-app에 sanitizeAiText, FEW_SHOT, anchoring 회피 등 추가) | public-app |
| cardNewsPrompt.ts | 500 | 464 | public-app만 sourceContent 모드, sanitize 강화 | public-app |
| cardTemplateService.ts | 327 | 273 | 230 lines diff | 비교 후 통합 |
| keywordAnalysisService.ts | 639 | 695 | 133 lines diff | 미상 |
| postStorage.ts | 237 | 208 | public-app만 deletePost 보유 | public-app |
| creditService.ts | 78 | 89 | next-app이 service_role 우회 우선 | next-app |
| serverAuth.ts | 24 | 23 | 코멘트만 차이 | 동등 |
| **(diff 0, blog-core 1차 후보)** | | | | |
| blogSectionParser, cardNewsDesignTemplates, categoryTemplateTypes, **categoryTemplates(2650!)**, constants, devLog, fetchWithRetry, htmlUtils, referenceFetcher, trustedMedicalSources | 동일 | 동일 | 즉시 이주 가능 |

## Critical

### [ARC-001] CardNewsProRenderer 완전 다른 렌더 엔진 (Konva vs HTML/CSS)
- 아키텍처 / Critical
- public-app: `components/CardNewsProRenderer.tsx` 1772 lines (react-konva)
- next-app: `components/CardNewsProRenderer.tsx` 3293 lines (HTML/CSS, konva 의존성 0)
- 같은 파일명·같은 props 시그니처지만 내부 완전 다름. README는 "fabric.js"라고 적힘 — **3중 진실**
- 한쪽 버그 픽스를 다른 쪽에 자동 적용 불가
- 수정: 별도 패키지로 분리 또는 한쪽으로 통일 (큰 의사결정)

### [ARC-002] next-app sanitize.ts — XSS 보안 회귀
- 아키텍처/보안 / Critical / `next-app/lib/sanitize.ts:1-11`
- `<style>` 허용 + `data:` URI 허용 + SSR raw HTML pass-through
- 5개 dashboard 페이지 (clinical, press, refine, youtube, history)에서 dangerouslySetInnerHTML 노출
- CSS 키로거 + data URL 정보 유출 가능
- 수정: public-app sanitize 정책으로 통일 또는 packages/blog-core/src/sanitize 단일화
- **반드시 보안 픽스로 기록**

## High

### [ARC-003] sanitize.ts vs sanitizeHtml.ts next-app에 공존 (정책 불일치)
- 아키텍처 / High
- 5개 페이지는 sanitize.ts (느슨), AdminContentsTab은 sanitizeHtml.ts (엄격)
- 수정: 단일화 (sanitizeHtml.ts 정책 우선)

### [ARC-004] keyIndex 모듈 전역 mutable — 동시성 race
- 아키텍처 / High / 5곳
- `public-app/app/api/gemini/route.ts:76`, `public-app/app/api/image/route.ts:44`, `next-app/app/api/gemini/route.ts:50`, `next-app/app/api/image/route.ts:46`, `next-app/lib/geminiDirect.ts:18`
- blog-core/src/llm/gemini.ts는 random-start로 수정됐으나 app routes 미이주
- 동시 요청이 같은 키 집중 → quota burst
- 수정: blog-core callGemini로 통일 또는 random-start 패턴 적용

### [BUG-001] CompletionScreen `getFinalResultUrl` Blob URL 매 렌더 누수 (Day 2 회귀)
- 버그 / High / `public-app/components/video-edit/CompletionScreen.tsx:235`
- `if (state.originalFile) return URL.createObjectURL(state.originalFile)` — 매 렌더 새 blob, revoke 없음
- 큰 영상에서 빠르게 수십 MB 누적
- 수정: `useBlobUrl(state.originalFile)` 훅 사용

### [BUG-002] InternalFeedback JSX inline createObjectURL (next-app)
- 버그 / High / `next-app/components/InternalFeedback.tsx:240`
- `<img src={URL.createObjectURL(f)}>` 매 렌더 새 URL
- 수정: useEffect cleanup 패턴

## Medium

### [ARC-005] blog-core 통합 미완 — 30+ 파일 로컬 lib 의존
- 즉시 이주 가능한 9개 파일 식별 (categoryTemplates 2650 lines 포함)
- 같은 파일이 두 앱에 250KB로 복제됨

### [ARC-006] lib/에 React 훅 (boundary 위반)
- `next-app/lib/useTeamData.ts:22-30` useEffect/useState 사용
- 수정: `next-app/hooks/useTeamData.ts`로 이동

### [BUG-003] KonvaSlideEditor 모듈 전역 mutate (렌더 race)
- `components/card-news/KonvaSlideEditor.tsx:41` + `KonvaHelpers.tsx:12-13`
- 슬라이드 N개 동시 렌더 시 마지막 Stage 폰트가 module 전역 차지
- 수정: React Context 또는 props drilling

### [BUG-004] CardNewsProRenderer keyboard handler stale closure
- `components/CardNewsProRenderer.tsx:387-390`
- undo/redo/handleSave deps 누락 (eslint-disable로 우회)
- Ctrl+Z/Y/S가 가끔 잘못된 시점 undo 스택 조작

### [BUG-005] BlogPage topic debounce useEffect — category deps 누락
- `app/(dashboard)/blog/page.tsx:88-106`
- 사용자가 카테고리 바꿔도 reference 안 갱신

### [BUG-006] runAutoMode stale closure (Agent D BIZ-006과 중복)
- `app/(dashboard)/video_edit/page.tsx:692-771`
- stateRef.current 활용 안 함 → 자동 모드 step chain 깨짐 위험

### [BUG-008] useAuthGuard timeout 경로에서 게스트 redirect 미처리
- `hooks/useAuthGuard.ts:32-57`
- 5s timeout 후 어중간한 상태로 남음

### [PERF-001] categoryTemplates.ts 250KB 양쪽 앱에 복제
- diff 0 → blog-core로 즉시 이주 가능

### [PERF-002] CardNewsProRenderer ResizeObserver re-attach
- `components/CardNewsProRenderer.tsx:469-486` deps `[slides.length, editingIdx]`
- 슬라이드 카운트 변경 시 jitter

### [PERF-003] handleGenerate 거대 useCallback deps (30+)
- `app/(dashboard)/image/page.tsx:1185`
- React.memo 무력화

## Low

### [ARC-007] /history 리다이렉트 비대칭 (public-app만)
### [ARC-008] next.config.ts 두 앱 byte-identical, image domains 화이트리스트 없음
### [BUG-007] BrandPresetEditor exhaustive-deps disable
### [PERF-004] Blog reference fetcher 800ms debounce 짧음

## Quality

### [QLT-001] README와 코드 불일치
- `public-app/README.md:11, 27` "fabric.js" → 실제는 konva
### [QLT-002] sfxLibrary 미사용 export 다수 (BGM_LIBRARY, BGM_MOOD_LABELS, getBgmByMood, getRandomBgm, searchSfx, getSfxByCategory)
### [QLT-003] sfxLibrary TODO — 효과음 파일 수동 다운로드 미완 (server에서 sfx_library_empty 반환)
### [QLT-004] devLog 정의 있지만 lib/cardDownloadUtils, card_news/page.tsx에서 console.log 직접 사용
### [QLT-005] AI 쇼츠 잔존 식별자 (EntryMode/AiShortsState/ScriptScene/aiShorts) — **0건 ✅** (깨끗)
### [QLT-006] fontStorage 레거시 키 마이그레이션 코드 잔존 (1회 실행 후 제거 가능)

## Operability (lib/UI 한정)

### [OPS-001] 에러 응답 포맷 불일치 ({error: msg} vs {message: ...} 혼재)
### [OPS-002] 빈 catch 블록 다수 (card_news/page.tsx:275, press/page.tsx:21, StepBgm.tsx:106,127, VideoPlayer.tsx 5곳)
### [OPS-003] auth.ts:97 console.error('프로필 생성 실패 (무시):', e) — e 객체 통째 로깅
### [OPS-004] devLog NODE_ENV 가드 정상 ✅

## 통계
| 카테고리 | Critical | High | Medium | Low |
|---|---|---|---|---|
| 🏗️ 아키텍처 | 2 | 2 | 2 | 2 |
| 🐛 버그 | 0 | 2 | 5 | 1 |
| ⚡ 성능 | 0 | 0 | 3 | 1 |
| 🧹 품질 | 0 | 0 | 0 | 6 |
| 📊 운영성 | 0 | 0 | 0 | 4 |
| **합계** | **2** | **4** | **10** | **14** |

총 30건

## 우선순위
1. **즉시**: ARC-002 (next-app sanitize XSS 회귀)
2. **이번 sprint**: BUG-001/002 (Blob URL 누수 회귀), ARC-004 (keyIndex race), BUG-006 (자동 모드 stale)
3. **다음 sprint**: ARC-001 (Renderer 분기 결정), ARC-005 (blog-core 이주), ARC-003 (sanitize 통합)
4. **백로그**: README, sfx 데드 export, 나머지

## 미검토
- API 라우트 (Agent A 담당)
- next-app/admin/** 전체
- diagnostic 모듈 깊이
- 테스트 커버리지
