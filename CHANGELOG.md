# CHANGELOG

WINAID의 굵직한 변경사항 기록. 세세한 수정은 `git log`를 참고.

---

## 2026-04 — Day 1 ~ Day 6 집중 정비 + AI 쇼츠 제거

5일에 걸쳐 보안·메모리·API 방어·정확성·검증·E2E를 대대적으로 정비하고, 유지보수 부담만 컸던 AI 쇼츠 생성기를 제거했습니다. 실질적으로 **+1,418 추가 / -2,132 삭제 = -714 줄** 감소하면서 기능·품질·테스트는 늘어났습니다.

### 🎯 AI 쇼츠 생성기 전체 제거 · `447ebef`

**배경**: "AI로 처음부터 만들기" 모드는 video-processor + GCP TTS + Gemini 이미지 + 조립 API 4개 동시 의존. 어느 하나 실패하면 전체 멈추고 에러 복구 없음. 촬영 영상 편집과 섞여 유지보수만 어려워서 제거.

**삭제 (11 파일, -1,803 줄)**
- 컴포넌트 2개: `AiShortsWizard.tsx`, `ModeSelector.tsx`
- API 라우트 7개: `ai-generate-script`, `ai-generate-tts`, `ai-preview-tts`, `ai-generate-scenes`, `ai-regenerate-scene`, `ai-assemble`, `ai-generate-bgm`
- lib 2개: `ttsVoices.ts`, `gcpAuth.ts` (`generate-subtitles`는 API key 방식이라 gcpAuth 미사용 확인 후 삭제)

**유지**
- `lib/videoStyles.ts` — `StepStyle`(촬영 영상 파이프라인)이 사용
- `lib/videoProxy.ts proxyJson` — 범용 유틸
- `/api/video/generate-subtitles` — STT (촬영 영상 자막)
- `/api/video/search-bgm` — Jamendo (촬영 영상 BGM 검색)
- `/api/video/card-to-shorts` — 카드뉴스 → 쇼츠 변환

**수정**
- `video_edit/page.tsx`: `EntryMode` state 제거, 진입 시 바로 촬영 영상 파이프라인
- `components/video-edit/types.ts`: `EntryMode`, `AiShortsState`, `ScriptScene` 등 삭제

### 🔐 Day 1 — 보안 긴급 수정 · `18788fa`

1. **`video-processor` 인증 미들웨어**: `PROCESSOR_SHARED_SECRET` 기반 `X-API-Secret` 헤더 검증. `/api/*` 경로에 적용. 시크릿 미설정 시 경고 로그 + 통과(개발 모드)
2. **`videoProxy.ts`**: `getAuthHeaders()` + `proxyFormData`/`proxyJson` 자동 헤더 주입
3. **`/health` 정보 최소화**: ffmpeg/ffprobe/autoEditor boolean만 반환, 경로·버전·pip list 등 제거
4. **Gemini API 키 redact**: 스트리밍 에러 경로(line 217)의 `errorText`에 `key=***` 치환 — public-app + next-app 모두
5. **drawtext 필터 인젝션 방어**: `drawtext=text='...'` → `drawtext=textfile='...'`. 텍스트를 workDir 파일로 저장 후 참조 (add-intro-outro, generate-thumbnail)
6. **프롬프트 인젝션 방어**: `lib/promptSanitize.ts` 신설. 대괄호/중괄호/백틱/따옴표 제거, 인젝션 키워드(무시/ignore/override 등) 제거, 길이 캡. `cardNewsPrompt.ts`와 `ai-generate-script/route.ts`에 적용
7. **`PipelineProgress` totalSteps 버그**: 하드코딩 6 → `TOTAL_STEPS`(9)
8. **`AiShortsWizard StepComplete` 개별 수정 버튼 버그**: "대본 수정/스타일/목소리/이미지 재생성" 4개 버튼이 전부 `onBack()` 호출하던 버그 → `patch({ currentStep: N })`
9. **HuggingFace fetch timeout**: `AbortSignal.timeout(30000)` 추가
10. **FFmpeg concat에 `-protocol_whitelist file,pipe`**: SSRF/LFI 방어 심화

### 💾 Day 2 — Blob URL 메모리 누수 박멸 · `033da96`

10여 곳에서 반복되던 blob URL 누수 차단. 1~2시간 편집 시 브라우저가 수백MB blob을 붙잡던 문제 해결.

- **`hooks/useBlobUrl.ts`** 신설: `useBlobUrl(source)` 훅 + `revokeIfBlob(url)` 헬퍼
- **영상편집 9개 step 전부**: `patchCrop/Style/Silence/Subtitle/Effects/Zoom/Bgm/Intro/Thumbnail`이 새 `resultBlobUrl` 저장 전 이전 값 revoke. `resetPipeline` + 페이지 unmount도 모든 URL 해제
- **StepBgm**: `disposeAudio` 헬퍼로 트랙 프리뷰 Audio 객체 완전 해제 (이전: pause만)
- **AiShortsWizard StepVoice**: TTS 프리뷰 blob URL 추적 + `state.audioUrl` 교체 시 해제 (AI 쇼츠 제거 전 시점)
- **WaveformBar**: `onCtxCreated` 콜백으로 in-flight `AudioContext`를 호출부에서 즉시 close — "too many AudioContexts"(브라우저 6~8개 제한) 회피
- **CardNewsProRenderer**: 쇼츠 변환 unmount cleanup을 `shortsResultUrlRef` 기반으로 교체 (이전: `useEffect([])` 초기 null 클로저 버그)
- **`lib/fontStorage.ts`** 신설: 커스텀 폰트를 localStorage(5MB 쿼터) → **IndexedDB**로 이동. `migrateLegacyLocalStorageFont()`로 기존 폰트 자동 이관. 드래프트 자동저장과 쿼터 충돌 해결

### 🛡 Day 3 — API 방어 + 드래프트 안정화 · `c4b062e`

1. **`gateGuestRequest` 사각지대 보강**: 감사 리포트가 "import만 있고 호출 X"라고 했지만 실측으로 **아예 import도 안 한 6개 라우트** 발견. `landing-chat`(자체 IP rate limiter 있음)은 제외, 5개에 추가: `pexels-query`(10/분), `pexels`(20/분), `pixabay`(20/분), `remove-bg`(10/분), `video/search-bgm`(20/분)
2. **`cardNewsDraft.ts` 전면 개선**:
   - `CardNewsDraft`에 `userId?`, `lastAccessedAt?` 필드 추가
   - `saveDraft(draft, userId)` → `SaveDraftResult` 반환 (QuotaExceededError 구분)
   - `loadDraft(currentUserId)` → `LoadDraftResult | null`: userId 불일치 시 null(공용 PC 시나리오), 만료는 "마지막 접근 후 48h" idle timeout, 로드 시 `lastAccessedAt` 자동 갱신, `expiringSoon`(2시간 이하) 반환
3. **`card_news/page.tsx`**: `currentUserId = creditCtx.userId`, `draftSaveError`/`draftExpiringSoon` state, 인디케이터 3계층 우선순위 (에러 > 임박 > 저장완료)
4. **글로벌 채팅 중복 전송 방지**: `globalChatSendingRef = useRef(false)` 동기 플래그 (setState 비동기 경쟁 차단)

### 🎯 Day 4 — cardRefs 정확성 + AbortController + Step Ordering · `a65aa85`

1. **`SlideData.id` 필드 추가**: `crypto.randomUUID` 기반 `generateSlideId()` + `ensureSlideIds(slides)` 헬퍼. `cardRefs`를 `Map<string, HTMLDivElement>`로 교체. **드래그 reorder 후 다운로드가 잘못된 카드를 캡처하던 버그 해결** (PNG/JPG/ZIP/PDF/쇼츠 모두 영향)
2. **`cancelRef` → AbortController 2-layer**:
   - `autoAbortRef`(루프 전체) + `stepAbortRef`(현재 fetch)
   - `beginStep()`: 이전 fetch abort + 새 signal 반환
   - 9개 process 함수 전부 `fetch`에 signal 전달 + AbortError는 조용히 return
   - `cancelAutoMode`가 **실제로 fetch를 abort** (이전: 루프 플래그만 종료, 서버는 5분짜리 transcode 계속)
3. **`invalidateDownstream(fromStep)`**: 수동 모드에서 이전 step으로 돌아갈 때 downstream의 `resultBlobUrl` 자동 무효화. "step 1 다시 실행 후 옛 step 2~3 결과가 섞이는" 버그 해결
4. **파일 분석 중 인디케이터**: `analyzingFile` state로 metadata 로드 중 "파일을 분석하고 있습니다..." 표시

### ⚕️ Day 5 — 의료광고법 검증 개선 · `075a6cc`

1. **`wordBoundary` 플래그 + 화이트리스트**:
   - `ViolationRule`에 `wordBoundary?: boolean` 추가, `hasKoreanWordBoundary(text, idx, len)` 엄격 경계 체크
   - `WHITELIST_PHRASES` 16건: "완전히 새로운/다른", "안전한 환경/공간", "최신 설비/장비" 등
   - `maskWhitelistedPhrases`: 화이트리스트 구문을 길이 보존 공백으로 치환 → 그 안의 키워드는 매칭 무시
   - `'완전'`, `'덤'` 룰에만 `wordBoundary: true` 적용 (high severity 룰은 전혀 건드리지 않음)
2. **`validateSlideMedicalAd(slide)`** — 30+ 텍스트 필드 전수 검사:
   - 평탄(flat): `title/subtitle/body/visualKeyword/quoteText/quoteAuthor/quoteRole/warningTitle/beforeLabel/afterLabel/prosLabel/consLabel/badge`
   - 배열: `checkItems/compareLabels/beforeItems/afterItems/pros/cons/warningItems/hashtags`
   - 객체 배열: `columns/icons/steps/dataPoints/questions/timelineItems/numberedItems/priceItems`
   - `SlideFieldViolation { field, fieldLabel, text, isFlat, violations }` 반환
3. **`SlideEditor`**: `slideViolations = useMemo(() => validateSlideMedicalAd(slide))`. 나머지 필드는 `renderNestedFieldSummary` 접이식 블록. `visualKeyword`는 "⛔ 이미지에 그려질 수 있어요" 특별 경고
4. **`replaceViolation` 확장**: `FlatTextField` 유니온 타입으로 13개 평탄 필드 지원
5. **`CardNewsProRenderer` 상단 배너**: 집계를 `validateSlideMedicalAd` 기반으로 교체 — 이제 사각지대 없음

### 🧪 Day 6 — E2E 스모크 테스트 · `1814d7d`

향후 리팩터링/기능 추가 시 회귀를 막기 위해 Playwright로 핵심 흐름 고정.

**신규 파일 10개**:
- `helpers/mocks.ts`: `setupCommonMocks(page)` — Gemini/Supabase/Pexels/Pixabay/Naver 등 전부 mock, `injectCardNewsDraft`, `guestUrl`
- `landing.spec.ts`(3), `auth.spec.ts`(2), `blog.spec.ts`(2), `card-news.spec.ts`(3), `video-edit.spec.ts`(3), `history.spec.ts`(1), `refine.spec.ts`(2), `not-found.spec.ts`(1), `api.spec.ts`(6)

**핵심 검증**:
- `card-news.spec.ts`: 드래프트 주입 → 모달 → "새로 시작" 후 localStorage 삭제 확인 (Day 3 기능 회귀 방어)
- `video-edit.spec.ts`: 업로드 영역 바로 노출, 모드 토글, **AI 쇼츠 UI가 없음 확인**
- `api.spec.ts`: `ai-generate-bgm`, `ai-generate-script`, `ai-assemble` → **404 확인** (AI 쇼츠 제거 회귀 방어)
- `api.spec.ts`: `/api/pexels` 25회 연속 호출 → Day 3 추가된 rate limit(429) 확인

**기존 `smoke.spec.ts`**: "integration" 성격으로 재분류. 실제 Supabase/Gemini 의존 테스트 4개에 `RUN_INTEGRATION=1` 게이트 추가. `/history → /mypage` 리다이렉트 관련 #7도 skip.

**총 38 tests in 11 files**. `npm run test:e2e`로 실행.

### 🐛 기타 버그 수정

- **`StepIndicator` 축약 로직 제거** · `78fb1e5` — 단계별 모드에서 현재 ±2만 표시되어 중간 7개 단계가 사라지던 버그. 축약 제거 + `scrollIntoView` 추가
- **teamData 김소영 매니저 정리** · `6b2ba83` + SQL 마이그레이션 · `27f9c44`

---

## 이전 변경사항 (2026-03)

- 블로그 생성 후 SEO 상세 분석 패널 추가
- `blog/page.tsx` 컴포넌트 분리 (`BlogFormPanel`, `BlogResultArea`)
- `categoryTemplates`(204KB) 동적 import로 번들 최적화
- 랜딩 챗봇 세션당 10회 API 호출 제한
- 관리자 대시보드 CSV 내보내기
- cron 엔드포인트 `CRON_SECRET` 필수화
- Vite → Next.js App Router 전환 완료 (`next-app`, 이후 `public-app` 포크)

---

## 이전 변경사항 (2026-01~02)

- 초기 MVP: 블로그 생성 / 보도자료 / 카드뉴스 / 이미지
- Supabase 도입 (인증 + DB)
- 크롤러 서버 분리 (`crawler-server`)
- 촬영 영상 편집 파이프라인 (9단계)
