# AI 이미지 파이프라인 audit — 2026-05-15

WS-3 (handoff 2026-05-15 작업) 의 진단 결과 + P-2 타임아웃 정책 (CLAUDE.md "고정 정책") 준수 검증 + quick win 적용 기록.

본 audit 은 read-only 진단이 주 + P-2 위반 1건 즉시 수정. 대규모 변경 (모델 교체·프롬프트 재설계) 은 "후속 백로그" 로 분리.

---

## 1. 사용 모델 + 버전

| 위치 | 모델 ID | 환경변수 override | snapshot pin |
|---|---|---|---|
| `next-app/app/api/image/route.ts:685` | `process.env.OPENAI_IMAGE_MODEL \|\| 'gpt-image-2'` | OPENAI_IMAGE_MODEL | 가능 (`gpt-image-2-2026-04-21`) |
| `public-app/app/api/image/route.ts:697` | 동일 패턴 | OPENAI_IMAGE_MODEL | 가능 |
| `next-app/app/api/hospital-images/auto-tag/route.ts` | `gemini-3.1-flash-lite-preview` 외 | (route 내부) | — |
| `public-app/app/api/hospital-images/auto-tag/route.ts` | 동일 | — | — |
| `public-app/app/api/card-news/generate-images/route.ts:99` | gpt-image-2 (`buildImagePromptWithTheme` 빌더 통과) | OPENAI_IMAGE_MODEL | — |

**모델 의존 risk**: 핸드오프 2026-05-15 §3.5 (preview 모델 deprecation 추적 부재) 와 정합. preview suffix 모델은 Google 측 GA 전환 시 명칭 변경 → kill-switch 없는 라우트가 일제히 502. 운영자 모니터링 필요.

**snapshot pin 권장**: `OPENAI_IMAGE_MODEL=gpt-image-2-2026-04-21` env 설정 (양 앱). 현재 코드는 미설정 시 alias 사용 (silent 업그레이드 위험).

---

## 2. 이미지 프롬프트 빌더 구조 (글 → 이미지 프롬프트 변환)

| 단계 | 위치 | 책임 |
|---|---|---|
| 1. blog-core `buildImagePrompt` | `packages/blog-core/src/blogPrompt.ts:157` | 글 contexts (category, topic, altText, imageStyle) → 영문 prompt 문자열 |
| 2. categoryHints prefix | `blogPrompt.ts:172-180` | 7 카테고리 × `dental clinic setting / dermatology clinic / ...` 한 줄씩 prefix |
| 3. CATEGORY_IMAGE_GUIDES 보완 | `blogPrompt.ts:119` (7 카테고리 maps) | setting / subject / style 3 필드 가이드. drift-zero invariant (imageCategoryGuide.test.ts) 강제 |
| 4. 호출자 `/api/image` route | `next-app/.../route.ts:235~` (cardNewsStyleBlock + buildCardStyleBlock) | imageStyle (`photo`/`medical`/`infographic`/`illustration`/`custom`) 별 추가 블록 |
| 5. server-side 보강 | `route.ts:469~668` (next-app), `route.ts:475~674` (public-app) | LOCATION 룰 + HARD OVERRIDE + 비임상 strip helper (handoff 2026-05-07 §2.4~§2.6) + 의사+환자 시선 일관성 (PR `99d0bdd`) |
| 6. OpenAI 호출 | `route.ts:712~754` | gpt-image-2 멀티키 로테이션. 키별 timeout 120s × 2회. P-2 의 300s 안에 안전. |

**categoryHints / CATEGORY_IMAGE_GUIDES** 양쪽 다 7 카테고리 매핑 — drift-zero invariant 확인.

빌더 통과 → 라우트 → 모델 흐름은 양 앱 lockstep. 단, **handoff 2026-05-07 §10.7** 에 명시된 "옵션 C — blog-core buildImagePrompt 의 categoryHints 정리" 는 미적용. server-side HARD OVERRIDE + strip helper 가 잔여 clinic-bias 를 잡고 있는 상황 유지.

---

## 3. 카테고리별 스타일 가이드 적용 위치

| 호출 지점 | buildImagePrompt 통과? | 가이드 누락 발견? |
|---|---|---|
| `next-app/(dashboard)/blog/page.tsx:1232` | ✅ | 없음 |
| `next-app/components/ImageInsertModal.tsx:98` | ✅ | 없음 |
| `public-app/(dashboard)/blog/page.tsx` (블로그 이미지) | ✅ | 없음 |
| `public-app/app/api/card-news/generate-images/route.ts:99` (`buildImagePromptWithTheme`) | ❌ — 자체 빌더 (carousel 전용 테마 블록) | category 가이드 적용 X — **의도된 분리** (card-news 는 글 카테고리 아닌 슬라이드 theme) |
| AI 이미지 생성 → 첨부 인플로우 (image insert modal 외 경로) | grep 결과 추가 호출자 없음 | — |

**판단**: 카테고리 가이드 누락은 없음. card-news 자체 빌더는 의도된 분리 — handoff §10.3 의 기능 매트릭스와 정합 (card-news 는 public-app 전용 풀 에디터). 후속 백로그로 "card-news 도 카테고리 가이드 통합" 검토 가능하나 본 WS 범위 외.

---

## 4. 실패 / 부적절 결과 검증 단계 유무

| 검증 종류 | 적용 위치 | 상태 |
|---|---|---|
| HTTP 에러 / null 응답 | `route.ts:716-754` 키 로테이션 catch block | ✅ |
| Content policy reject (OpenAI) | 키 로테이션 catch (`refundCredit` 트리거) | ✅ refund 동작 |
| NSFW / 의료 도구 오표현 | server-side 텍스트 검증 — **없음** | ⚠️ Vision 측 검증 부재 |
| 텍스트 깨짐 / 글자 들어간 이미지 | 빌더의 `no text / no captions in image` 룰 | ✅ 빌더 레벨 강제 |
| 다중 분할 (collage / grid) | handoff §2.3 의 anti-collage 룰 | ✅ 빌더 + HARD OVERRIDE |
| 비임상 행동에 진료의자 표시 | handoff §2.4~§2.6 의 LOCATION / HARD OVERRIDE / strip helper | ✅ 3중 방어 |
| 시선 불일치 (의사·환자) | PR `99d0bdd` BLOG_HARD_OVERRIDE 룰 | ✅ |

**검증 부재 영역**: 생성된 이미지의 시각적 위반 (예: 가짜 약병·기구·문구 노출) — 시각 검증 X. 향후 Vision 후처리 검수 검토 가능.

---

## 5. 비용 / 속도

- **per-image latency**: gpt-image-2 quality `auto/medium` + 16:9 / A4 → 60-90s 흔함. handoff INVARIANTS §1 의 per-key timeout 120s 와 정합.
- **retry 정책**: 키 로테이션 `MAX_KEY_ATTEMPTS = min(keys.length, 2)`. 키 2개 시도 후 fail → 환불.
- **wait between attempts**: 키별 1.5s wait (handoff 의 245s budget 계산 참고).
- **총 budget**: `MAX_KEY_ATTEMPTS × 120s + waits ≤ 245s`. **P-2 300s 안에 안전**.
- **블로그 1건의 이미지 생성 동시성**: `BLOG_SECTION_CONCURRENCY=3` cap 적용 — Anthropic Tier 1 보호 (handoff §9.3).

비용 cap: **없음** — 핸드오프 2026-05-15 §3.7 그대로. per-user daily LLM/이미지 USD cap 부재.

---

## 6. 타임아웃 설정 — P-2 준수 검증

| 라우트 | maxDuration | P-2 (≥300) |
|---|---|---|
| `next-app/app/api/image/route.ts` | 300 | ✅ |
| `public-app/app/api/image/route.ts` | 300 | ✅ |
| `next-app/app/api/hospital-images/auto-tag/route.ts` | 300 | ✅ |
| `public-app/app/api/hospital-images/auto-tag/route.ts` | 300 | ✅ |
| `next-app/app/api/hospital-images/upload/route.ts` | ~~30~~ → **300** | ✅ (본 WS 에서 수정) |
| `public-app/app/api/hospital-images/upload/route.ts` | ~~30~~ → **300** | ✅ (본 WS 에서 수정) |
| `next-app/app/api/hospital-images/route.ts` (CRUD) | 미설정 (Vercel default) | ⚠️ 명시 권장 — CRUD 라 30s 도 충분하나 P-2 일관성 차원 |
| `next-app/app/api/hospital-images/[id]/route.ts` (CRUD) | 미설정 | ⚠️ 동일 |
| `public-app/app/api/hospital-images/route.ts` (CRUD) | 미설정 | ⚠️ 동일 |
| `public-app/app/api/hospital-images/[id]/route.ts` (CRUD) | 미설정 | ⚠️ 동일 |
| `public-app/app/api/card-news/generate-images/route.ts` | (별도 확인 필요) | ⚠️ |

**적용된 quick win**: upload 라우트 양 앱 30→300. 사용자가 큰 파일을 느린 네트워크로 업로드할 때 503 회귀 차단.

**남은 CRUD 라우트**: 메타데이터 CRUD 라 30s 도 충분 — P-2 의 "이미지 생성 + 라이브러리 후처리" 정의에 엄밀히 들어가지 않음. 본 audit 에서는 quick win 으로 처리하지 않음. **후속 백로그** 에 명시 권장 (`hospital-images CRUD 4개 라우트 maxDuration 명시화`).

**클라이언트 측 fetch timeout**: 양 앱의 image 업로드/생성 fetch 가 timeout 미명시 (브라우저 기본 ≈무한대 또는 5분). P-2 정렬 — server 측 300s 안에 종료되므로 client 가 더 길게 기다리는 케이스는 없음.

---

## 7. 회귀 테스트 유무

| 테스트 | 위치 | 상태 |
|---|---|---|
| 카테고리 이미지 가이드 drift-zero | `packages/blog-core/src/__tests__/imageCategoryGuide.test.ts` | ✅ 7 카테고리 매핑 강제 |
| buildImagePrompt 카테고리별 토큰 포함 | 동 파일 | ✅ |
| 라이브러리 매칭 정확도 (confusable 분리) | `packages/blog-core/src/__tests__/imageMatcher.test.ts` (WS-2 본 작업) | ✅ |
| P-2 타임아웃 invariant | `packages/blog-core/src/__tests__/fixedPolicyInvariant.test.ts` (WS-0 본 작업) | ✅ |
| **AI 이미지 생성 실패 → 환불** | — | ❌ 미구현 (전통적으로 통합 테스트 영역) |
| **부적절 이미지 (텍스트 박힘 등) detection** | — | ❌ 미구현 (Vision 후처리 검수 백로그) |

---

## quick win 적용 list (본 WS)

1. ✅ **P-2 정렬**: `next-app` + `public-app` `hospital-images/upload/route.ts` maxDuration 30 → 300. (필수)
2. ✅ **P-2 invariant 가드**: `fixedPolicyInvariant.test.ts` 가 image route maxDuration ≥ 300 강제 (WS-0 에서 추가됨). 회귀 차단.
3. (선택 quick win 3개 한도 중 2개만 사용) 더 큰 변경은 후속 백로그로 분리.

---

## 후속 백로그

본 audit 에서 진단된 항목 중 본 WS 에서 처리하지 않은 것:

| # | 항목 | 우선순위 | 복잡도 |
|---|---|---|---|
| 1 | **hospital-images CRUD 4개 라우트 maxDuration 명시화** (300 또는 30 명시) | 낮음 | 낮음 |
| 2 | **card-news/generate-images route maxDuration 확인** + P-2 정렬 | 중간 | 낮음 |
| 3 | **모델 ID 중앙화** — `OPENAI_IMAGE_MODEL` snapshot pin 환경변수 양 앱 .env.example 추가, README 문서화 | 중간 | 낮음 |
| 4 | **blog-core buildImagePrompt 의 categoryHints 정리 (옵션 C)** — handoff 2026-05-07 §10.7. server-side HARD OVERRIDE + strip helper 의 의미 약화 → 정리 가능 | 중간 | 높음 (양 앱 동시 영향) |
| 5 | **gemini 모델 deprecation 추적** — preview suffix 모델 GA 전환 시 일제 502 회피. 라우터 alias map + runtime warning. handoff 2026-05-15 §3.5 와 정합. | 중간 | 중간 |
| 6 | **시각 검수 단계** — 생성된 이미지에 가짜 약병/기구/문구 들어간 케이스 Vision 후처리 검출. 비용·복잡도 trade-off 필요. | 낮음 | 높음 |
| 7 | **per-user daily 이미지 cap** — 핸드오프 2026-05-15 §3.7. 비용 leakage 차단. P-1 어드민은 면제. | 중간 | 중간 |
| 8 | **AI 이미지 환불 텔레메트리 강화** — 환불 성공/실패 비율 추적 (Sentry tagging 또는 별도 metric). 핸드오프 2026-05-07 §9.5 와 정합. | 낮음 | 낮음 |

위 8건은 별도 PR 로 처리. 본 WS 는 P-2 위반 즉시 fix 1건 + audit 문서화 + 회귀 가드 wiring 으로 완료.
