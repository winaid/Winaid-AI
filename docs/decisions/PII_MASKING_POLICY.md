# LLM PII 마스킹 정책 ADR

**상태**: Proposed (의사결정 자료 — 결정 미정)
**작성일**: 2026-05-06
**작성자**: ADR-1 (read-only 분석)
**관련 감사 ID**: BL-B-014 (`docs/audits/blog/_findings_BL-B.md:351-358`) / PII 인벤토리 14번 (`docs/PII_INVENTORY.md:33,136-150`)

> ⚠️ **본 문서의 성격**
> - 본 문서는 **사실 정리 + 옵션 비교** 자료다. **결정은 사용자 + 법무**.
> - 모든 코드 인용은 `git fetch origin main` 시점(HEAD `fe9725e`)의 read-only grep 결과.
> - 법령(PIPA / 의료법) 적용 단정 금지 — "위반 risk" 로만 표현. 최종 적용 여부는 법무 판단.

---

## 0. TL;DR

- **현재 상태**: 외부 LLM(Anthropic Claude / Google Gemini / OpenAI / Google STT)으로 환자명·의사명·병원담당자명·주소·진료 사례 본문이 **마스킹 없이 그대로 전송**된다. 인젝션 방어용 `sanitizePromptInput`(`packages/blog-core/src/promptSanitize.ts:50`)이 존재하나 PII 마스킹 함수는 부재(BL-B-014).
- **PIPA 위반 risk**: 제17조 처리위탁 동의·고지, 제22조 동의 범위, 제28조 국외 이전 안전성 확보. 의료법 §22 환자 비밀유지 risk.
- **권고 1순위 (ADR-1 제안)**: **Option B (타겟 마스킹) + Option C (옵트인 강도 선택) 결합**.
  - 근거: 의료 컨텍스트(증상·진단·시술명·해부학)는 LLM 출력 품질에 필수이므로 Option A는 출력 품질 저하 risk가 크다. Option D는 PIPA risk 미해소. B+C는 식별 정보(이름·연락처·식별번호·주소)만 결정적으로 치환하면서 의료 의미 손실을 최소화한다.
- **결정은 사용자 + 법무** — A/B/C/D 또는 보류 중 하나를 PR 코멘트에 명시 요청.

---

## 1. 배경

### 1.1 PR #120 PII 인벤토리 — 14번 항목 요약

`docs/PII_INVENTORY.md:33` 14번 카테고리("LLM 프롬프트 입력")는 **외부 전송**이라는 사실만 명시하고, 마스킹 정책은 정의 안 함. `docs/PII_INVENTORY.md:136-150` 표는 외부 전송 LLM 11종을 나열:

- Google Gemini (generativelanguage.googleapis.com) — 데이터센터 위치 미확인
- Anthropic Claude (`@anthropic-ai/sdk`, US 데이터센터로 알려짐 — 공식 문서 확인 필요)
- OpenAI (api.openai.com)
- Google Cloud Speech-to-Text (`us-central1` 명시 — `app/api/video/generate-subtitles/route.ts:98`)
- (참고) remove.bg, Pexels, Naver, Pinterest 등 — PII 거의 없음. 본 ADR 범위 밖.

### 1.2 BL-B-014 발견 요약

`docs/audits/blog/_findings_BL-B.md:351-358`:

> **[BL-B-014] 외부 LLM 전송 전 PII 마스킹 부재**
> - 심각도: High
> - 위치: `public-app/app/api/gemini/route.ts`, `public-app/app/api/generate/blog/route.ts:247`, Anthropic SDK 다수, `app/api/hospital-images/auto-tag/route.ts:180`, `app/api/video/generate-subtitles/route.ts:131-175`(STT)
> - 현상: 환자명/의사명/병원담당자명/주소가 사용자 입력에 포함되어도 마스킹·PII 분리 없음. `sanitizePromptInput`은 인젝션 방어이지 PII 마스킹 아님.
> - 영향: PIPA §17 위탁 처리 동의·공지 미흡 가능. 환자 식별 정보가 외부 LLM 학습 데이터로 흐를 risk.

또 `_findings_BL-B.md:174-180`은 4개 보조 발견(BL-B-PII-001..004) — 카드뉴스 슬라이드, STT 자막의 generated_posts 저장 가능성, diagnostic_history URL 본문 OpenAI 전송, hospital_images auto-tag Gemini 전송 — 을 나열한다.

### 1.3 적용 가능 법령 (위반 risk — 법무 판단 영역)

- **PIPA 제17조 (개인정보 제3자 제공·처리위탁)** — 외부 LLM 전송이 위탁으로 분류될 가능성. 위탁 사실 처리방침 공지·동의 부재 risk.
- **PIPA 제22조 (동의)** — `public-app/app/auth/page.tsx`에 명시적 동의 체크박스 부재(`PII_INVENTORY.md:192`).
- **PIPA 제28조 (국외 이전)** — Anthropic/OpenAI/Google 모두 미국·기타 국가 데이터센터 가능성. 별도 동의 의무 risk.
- **의료법 §22 (환자 비밀유지 의무)** — 환자 식별 정보가 의사로부터 제3자(LLM 사업자)로 흐를 가능성.
- **개인정보 가명·익명처리 가이드** (개인정보보호위원회) — 마스킹 강도·방법 참고 자료.

위 사항은 **법무 검토 필수**. 본 ADR은 단정 안 함.

---

## 2. 현재 상태 (사실 자료)

### 2.1 LLM 호출 지점 인벤토리

`grep -rn "callLLM|callGemini|callClaude|@anthropic-ai/sdk|generativelanguage.googleapis|api.openai.com|from 'openai'"` 결과(node_modules·테스트 제외, 128 hit). 핵심 호출 지점:

#### A. 통합 어댑터 경유 (`@winaid/blog-core` `callLLM`)

| # | 호출 지점 (file:line) | task | 사용자 입력 | envelope 분리 | sanitize | 비고 |
|---|---|---|---|---|---|---|
| 1 | `public-app/app/api/generate/blog/route.ts:168,205,259` | `blog_outline`, `blog_unified` | topic, hospitalName, doctorName, keywords, patientPersona, stylePromptText | **분리됨** (systemBlocks vs userPrompt) | injection-only (`sanitizePromptInput`) | `packages/blog-core/src/blogPrompt.ts:1604-1648` |
| 2 | `public-app/app/api/generate/blog/section/route.ts:58` | `blog_unified_section` | 동일 | 분리됨 | injection-only | |
| 3 | `public-app/app/api/generate/blog/review/route.ts:125` | `blog_review` | 본문 + 의역 검수 | 분리됨 | `sanitizeSourceContent` | |
| 4 | `public-app/lib/diagnostic/enrich.ts:65,246` | `diagnostic_narrative` | URL 크롤링 본문(환자 후기 가능) | 분리됨 | injection-only | |
| 5 | `public-app/lib/referenceFetcher.ts:138` | (검색 보조) | 검색어 query | 분리됨 | injection-only | |
| 6 | `public-app/app/api/diagnostic/competitor-gap/route.ts:117` | (텍스트 해설) | 진단 결과 본문 | 분리됨 | unknown | |
| 7 | `public-app/app/api/llm/route.ts:81` / `next-app/app/api/llm/route.ts:50` | (범용 프록시) | 클라이언트 임의 prompt | systemBlocks 받음(게스트는 무시) | **없음** | OPS 위험: 사용자가 PII 직접 prompt 가능 |
| 8 | `public-app/app/api/llm-smoke/route.ts:93` / `next-app/.../llm-smoke/route.ts:93` | (smoke test) | 테스트 prompt | 분리됨 | n/a | |
| 9 | `next-app/app/api/llm-batch-smoke/route.ts:91` | (batch smoke) | 테스트 prompt | 분리됨 | n/a | |

#### B. Gemini 직호출 (`/api/gemini` 또는 `generativelanguage.googleapis.com` 직접)

| # | 호출 지점 (file:line) | 사용자 입력 | envelope | sanitize | 비고 |
|---|---|---|---|---|---|
| 10 | `public-app/app/api/gemini/route.ts:95,306` | 임의 prompt + systemInstruction | 분리되나 게스트만 systemInstruction 무시 | **없음** | 비스트리밍 + 스트리밍 |
| 11 | `public-app/app/api/generate/clinical/route.ts:110` → `/api/gemini` | **환자 증례 텍스트** + 의사명 + 병원명 | 분리됨(buildClinicalPrompt) | injection-only (`clinicalPrompt.ts:113-120`) | **최고 risk — 환자 식별 정보 직접 입력 가능** |
| 12 | `public-app/app/api/generate/card_news/route.ts:94` → `/api/gemini` | 슬라이드 본문 | 분리됨 | unknown | BL-B-PII-001 |
| 13 | `public-app/app/api/generate/press/route.ts:121` → `/api/gemini` | 보도자료 본문 + stylePrompt | 분리됨 | unknown | |
| 14 | `public-app/app/api/generate/youtube/route.ts:101` → `/api/gemini` | 영상 스크립트 + transcript | 분리됨(buildYoutubePrompt + sanitizeSourceContent) | source-level | |
| 15 | `public-app/app/api/landing-chat/route.ts:160` | 챗 메시지 | 서버 하드코딩 system | injection-only | |
| 16 | `public-app/app/api/help-chat/route.ts:262` | 사용자 도움 query | 서버 하드코딩 system | injection-only | |
| 17 | `public-app/app/api/hospital-images/auto-tag/route.ts:180` | **이미지 base64** + 텍스트 prompt | 분리됨 | n/a (이미지) | BL-B-PII-004. 환자 얼굴/차트 자동 마스킹 부재 |
| 18 | `public-app/app/api/pexels-query/route.ts:15` | 검색 query | 단순 prompt | n/a | PII 거의 없음 |
| 19 | `public-app/app/api/remove-bg/route.ts:58` | 검색 query | 단순 prompt | n/a | PII 거의 없음 |
| 20 | `public-app/lib/clinicContextService.ts:63-115` | 병원 컨텍스트 prompt | unknown | unknown | |
| 21 | `public-app/lib/keywordAnalysisService.ts:195-436` | 키워드 prompt | unknown | unknown | |
| 22 | `public-app/lib/diagnostic/discovery.ts:667` | URL 진단 query | SSE | unknown | next-app 동일 |
| 23 | `next-app/app/api/influencer/search/route.ts:225`, `next-app/app/api/influencer/generate-dm/route.ts:133` | 인플루언서 SNS 메타 + DM | `callGeminiDirect` | unknown | (next-app 내부도구) |

#### C. Anthropic 직호출 (SDK)

| # | 호출 지점 | 비고 |
|---|---|---|
| 24 | `packages/blog-core/src/llm/claude.ts:132` | `client.messages.create` — `req.systemBlocks` → `system`, `req.userPrompt` → `messages[0].content`. envelope 분리 보장. |
| 25 | `packages/blog-core/src/llm/claudeBatch.ts` | Anthropic Message Batches API. 동일 envelope. |

→ Anthropic 호출은 **반드시** `callLLM` 경유로 들어옴(직접 SDK 호출은 위 두 파일뿐). 이 지점에 마스킹 hook 추가하면 모든 Claude 트래픽을 한 번에 커버 가능.

#### D. OpenAI 직호출

| # | 호출 지점 | 사용자 입력 | 비고 |
|---|---|---|---|
| 26 | `public-app/app/api/image/route.ts:13` (`import OpenAI from 'openai'`) | 카드뉴스/이미지 prompt 본문(`body.prompt`) | gpt-image-2. PII 가능성 있음(주소·이름 입력 가능). |
| 27 | `public-app/lib/diagnostic/discovery.ts:521` (`messages: [{ role: 'user', content: wrapAsQuestion(query) }]`) | 진단 검색 query (병원명 포함) | OpenAI Chat Completions. envelope: 단일 user 메시지(system 분리 없음 확인 필요). |
| 28 | `next-app/app/api/image/route.ts:15` / `next-app/lib/diagnostic/discovery.ts:521` | 동일 (next-app 측) | |
| 29 | `next-app/app/api/zdebug/openai-ping/route.ts:17` | 디버그 ping | PII 없음 |

#### E. Google STT (Speech-to-Text V2)

| # | 호출 지점 | 사용자 입력 | 비고 |
|---|---|---|---|
| 30 | `public-app/app/api/video/generate-subtitles/route.ts:179-187` | **사용자 업로드 영상의 음성 데이터(원본 base64)** | 환자 음성·의료 상담 음성 포함 가능. 마스킹 불가능(원본 음성 자체). 데이터센터: `us-central1`(line 98). BL-B-PII-002. |

→ STT는 마스킹 대상이 아님(원본 음성을 마스킹하면 STT 불가). **결과 transcript의 후처리 마스킹**이 의미 있음 (Option B/C 적용 시).

### 2.2 envelope 분리 — 종합 평가

- **Anthropic 경로**: `callClaude` (`claude.ts:132-143`)에서 `system` 배열 vs `messages[0].content`(user) 분리 — 정상.
- **`callLLM` 인터페이스** (`types.ts:64-89`): `systemBlocks: CacheableBlock[]` + `userPrompt: string` 명시적 분리 — 정상.
- **Gemini 경로**: `gemini.ts:160-169`에서 `systemInstruction` vs `contents[0].parts[0].text` 분리 — 정상.
- **OpenAI Chat Completions** (`discovery.ts:521`): `messages: [{ role: 'user', content: wrapAsQuestion(query) }]` — **system 분리 미확인**(파일 추가 정독 필요).
- **OpenAI Image** (`image/route.ts`): 단일 prompt 필드 (Image API는 envelope 개념 없음).
- **STT**: envelope 개념 없음 (raw audio).

### 2.3 PII 인벤토리 14 카테고리 × LLM 전송 가능성

| 인벤토리 # | 카테고리 | LLM 전송 여부 | 어느 호출 지점에서 | 비고 |
|---|---|---|---|---|
| 1 | 이메일/비번 해시 | 전송 안 됨 | — | auth.users는 LLM 미참조 |
| 2 | 프로필(이름·병원명·주소·홈페이지) | **전송됨** | #1, #11, #12, #13, #14 (hospitalName 직접 인용) | sanitize는 인젝션만 |
| 3 | IP 해시 | 전송 안 됨 | — | rate limit 용 |
| 4 | 사용자 콘텐츠(블로그/카드뉴스 본문, 의사명, 직함) | **전송됨** | #1~3, #11~14 | doctorName, doctorTitle 인용 (`blogPrompt.ts:1607-1608`) |
| 5 | 결제·구독 | 전송 안 됨 | — | DB만 |
| 6 | 사용량 로그 | 전송 안 됨 | — | DB만 |
| 7 | 진단 이력(URL·점수·분석본문) | **전송됨** | #4, #6, #22, #27 | 사이트 크롤링 본문 → OpenAI/Claude |
| 8 | hospital_images 업로드 | **전송됨** | #17 | 이미지 base64. 환자 얼굴/차트 마스킹 부재(BL-B-PII-004) |
| 9 | 영상 업로드 | **전송됨** | #30 (STT) | 환자 음성 가능 |
| 10 | 외부 블로그 크롤링 | **전송됨(간접)** | `style_learn` task | hospital_crawled_posts → 말투 학습 prompt |
| 11 | blog_history(임베딩) | **전송됨(간접)** | Gemini Embedding API (인벤토리 명시) | 본 ADR 범위 외 — 임베딩 호출 별도 grep 필요 |
| 12 | 내부 피드백 | 전송 안 됨 | — | DB만 |
| 13 | 인플루언서 아웃리치(SNS·DM) | **전송됨** | #23 | next-app 내부 도구 |
| 14 | LLM 프롬프트 입력 | **자기 자신** | 본 카테고리 = 본 ADR 핵심 | |
| 15 | 클라이언트 LocalStorage | 전송 안 됨 | — | 브라우저 |
| 16 | 서버 로그 평문 userId | 전송 안 됨 | — | OPS-007 별도 |

→ **LLM 전송 시 PII로 분류되는 카테고리: 2, 4, 7, 8, 9, 10, 11, 13** (8개).

### 2.4 환자 식별 정보 직접 입력 위험 — 최고 risk 경로

`public-app/lib/clinicalPrompt.ts:13` — `sanitizePromptInput(req.topic, 500)` + `sanitizePromptInput(req.doctorName, 100)` + `sanitizeSourceContent(req.imageAnalysis, 10000)`. 사용자가 `req.topic`에 "60대 김OO 환자분..." 등 환자 식별 텍스트 입력 시 그대로 Gemini로 전송. UI에 환자 식별 정보 제거 안내 텍스트 + 동의 체크박스만 존재(`clinical/page.tsx:331-332,448-449`, `PII_INVENTORY.md:106-107`) — **자동 검열 없음 (사용자 책임 모델)**.

---

## 3. 옵션 비교

### Option A: 공격적 마스킹 (모든 명사 PII 후보 일괄 치환)

**개요**: 모든 prompt 입력에서 한국 인명 패턴(`[가-힣]{2,4} (씨|님|환자|원장|선생|교수|이사|대표)`)·전화·주민등록번호·주소·날짜·차트번호·이메일을 정규식으로 치환. NER 미사용. system 블록은 통과(병원명·고정 prompt 보존).

**구현 위치**:
- `packages/blog-core/src/llm/claude.ts:140` (직전), `packages/blog-core/src/llm/gemini.ts:161` (직전): `req.userPrompt = maskPII(req.userPrompt)`.
- `public-app/app/api/gemini/route.ts:309` (직접 호출 경로): `body.prompt = maskPII(body.prompt)`.
- `public-app/app/api/image/route.ts` (OpenAI): 동일.
- `public-app/lib/diagnostic/discovery.ts:521` (OpenAI Chat): `wrapAsQuestion(maskPII(query))`.
- STT 결과 transcript: `app/api/video/generate-subtitles/route.ts:200~ ` (응답 직전): `text = maskPII(text)`.

**변경 LOC 추정**: 신규 `packages/blog-core/src/piiMask.ts` ~150 LOC + 호출 지점 hook ~20 LOC.

**트레이드오프**:
- (+) 단일 함수로 모든 호출을 일괄 커버. 결정적·테스트 가능.
- (–) 의료 컨텍스트 손실: "임플란트 환자" → "임플란트 [REDACTED]" 같은 잘못된 매칭이 LLM 품질 저하 유발. 한국어 일반 단어가 인명 정규식과 충돌(예: "민감"·"평가" 등). False positive로 의역·해부학·시술명 잘림.
- (–) 의사명·병원명은 system 블록에 있어 마스킹 미적용 — 처리방침에 위탁 고지 그대로 필요.
- 회귀 위험: 블로그 5단계, 카드뉴스, 진단 narrative, refine_chat, style_learn 등 모든 task 출력 변화 가능. 회귀 테스트 광범위.

### Option B: 타겟 마스킹 (이름/전화/주민번호/차트번호/주소 식별 후 치환)

**개요**: 한국 인명·전화·주민번호·이메일·차트번호 패턴 + 한국 행정구역(시·도·구·동) 주소만 치환. 일반 명사·의료 용어는 보존. 기본은 정규식, optional NER hook은 phase 2로 미룸.

**식별 대상**:
- 주민등록번호: `\b\d{6}-?[1-4]\d{6}\b`
- 전화번호: `\b01[016-9]-?\d{3,4}-?\d{4}\b` / `\b0\d{1,2}-\d{3,4}-\d{4}\b`
- 이메일: 표준 RFC
- 한국 인명 패턴 (호칭 동반 시만): `[가-힣]{2,4}\s*(?:씨|님|환자|환자분|원장|선생|선생님|교수|이사|대표|박사)\b`
- 차트번호: `차트번호\s*[:：]?\s*\w+` (보수적)
- 주소: `[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s+[가-힣0-9-]+(?:동|로|길)` (병원 주소 system 블록 인용은 회피하기 위해 system 통과)

**구현 위치**: Option A와 동일 hook 지점, 함수만 다름.

**변경 LOC 추정**: 신규 `piiMask.ts` ~200 LOC (타겟 패턴 + unit test) + hook ~20 LOC.

**트레이드오프**:
- (+) 의료 컨텍스트(증상·진단·해부학·시술명)는 보존 → LLM 품질 영향 최소.
- (+) BL-B-014 핵심 risk(환자명·식별번호) 제거.
- (+) 처리방침 공지 + 동의 체크박스(별도 PR)와 결합 시 PIPA §17/§28 risk 상당 부분 완화 가능 (법무 판단).
- (–) 주민번호 외 패턴은 본질적으로 false negative 가능 — 호칭 없는 인명, 타국 주소, 별명 등은 그냥 통과.
- (–) `clinical/route.ts` 같이 사용자가 자유 텍스트로 환자 사례를 쓰면 이름 변형(`60대 K씨`)을 통해 우회 가능. UI 안내 + 동의 모델은 남음.

### Option C: 옵트인 (사용자 명시 동의 시 마스킹 강도 선택)

**개요**: 회원가입/처리방침 동의 시점에 "외부 LLM 위탁 처리 동의"를 명시적으로 받고, 마스킹 강도(off/타겟/공격적)를 사용자가 선택. 비동의자는 LLM 호출 거부 또는 로컬-only 기능만 노출.

**동의 흐름**:
- `auth/page.tsx`(인벤토리 5번 — 동의 체크박스 추가).
- 처리방침 본문에 위탁 사실 + 외국 데이터센터 명시(PR #120 후속 CMP-001a).
- 마이페이지에 마스킹 강도 토글 (`profiles.pii_mask_level: 'off'|'target'|'strict'`).
- 호출 지점에서 강도별 분기.

**구현 위치**: Option B 위에 사용자 선택 분기 추가. + DB 컬럼 + UI.

**변경 LOC 추정**: B의 +200 LOC + UI/DB ~150 LOC + 동의 흐름 변경 ~100 LOC.

**트레이드오프**:
- (+) PIPA §22 명시적 동의 요건에 가장 강하게 부합 (법무 판단).
- (+) 사용자가 의료 품질 vs 프라이버시를 선택.
- (–) 동의 흐름·UI·DB·마이그레이션 모두 변경. 작업 추정 시간·회귀 위험 가장 큼.
- (–) 게스트(비로그인) 사용자는 옵트인 못 함 — 게스트는 강도 'target' 강제 등 별도 정책 필요.

### Option D: No-mask (현 상태) — 위험 평가만

**개요**: 코드 변경 없음. 처리방침에 위탁 사실 + 외국 이전 명시 + 환자 식별 정보 입력 금지 안내만 강화 (UI 텍스트). 사용자 책임 모델 유지.

**트레이드오프**:
- (+) 작업 0. 회귀 위험 0.
- (+) LLM 출력 품질 영향 0.
- (–) PIPA §17/§22/§28 risk 미해소(법무 판단).
- (–) 의료법 §22 환자 비밀유지 risk 미해소(법무 판단).
- (–) BL-B-014 발견이 그대로 남음 — 감사 보고서가 외부 공개되거나 분쟁 발생 시 risk 가시화.

---

## 4. 비교 매트릭스

| 기준 | A (공격적) | B (타겟) | C (B+옵트인) | D (현상태) |
|---|---|---|---|---|
| PIPA §17 위탁 risk 완화 | 中 | 中 | 高 | 低 |
| PIPA §22 명시 동의 risk 완화 | 中 (동의 별도 PR 필요) | 中 (동의 별도 PR 필요) | 高 | 低 |
| PIPA §28 국외 이전 risk 완화 | 中 | 中 | 高 | 低 |
| 의료법 §22 환자 비밀유지 risk 완화 | 中 (false positive 큰 만큼 false negative 적음) | 中~高 (이름 변형 우회는 남음) | 高 | 低 |
| 의료 컨텍스트 손실 | **큼** | 작음 | 작음(off 선택 가능) | 없음 |
| 출력 품질 영향 | **부정적 가능** | 미미 | 미미 | 없음 |
| 구현 복잡도 | 낮음 | 중간 | 큼 | 없음 |
| 유지비 | 중간 (false positive 튜닝 지속) | 중간 (패턴 유지) | 큼 (UI/DB/감사 로그) | 없음 |
| 사용자 동의 흐름 변경 필요 | 별도 PR | 별도 PR | **본 PR에 포함** | 별도 PR (UI 텍스트만) |
| 비용 영향 (LLM 토큰 + 마스킹 처리) | -소 (토큰↓) | 무시 | 무시 | 0 |
| 회귀 위험 | **큼** (모든 task 출력 검증 필요) | 중간 | 큼 | 0 |
| 작업 추정 시간 | 1.5~2주 (회귀 테스트 포함) | 3~5일 | 2~3주 | 0 |

---

## 5. 권고 후보 (ADR-1 의견 — **결정은 사용자/법무**)

### 1순위: **B + C 병합** — 타겟 마스킹 기본 적용 + 옵트인 강도 선택

**근거**: BL-B-014 핵심 risk(환자명·식별번호·주민번호·차트번호·전화·이메일·주소)를 결정적으로 제거하면서 의료 의미(증상·진단·해부학·시술명)는 보존. 옵트인 토글(off/target/strict)을 두면 PIPA §22 동의 요건과 사용자 선택권을 동시에 충족(법무 판단). 단계적 도입 가능: B 먼저 → C는 phase 2.

### 2순위: **B 단독** — 타겟 마스킹만, 옵트인은 후속 PR

**근거**: 빠른 구현(3~5일)으로 BL-B-014 High 등급 발견을 신속히 닫을 수 있음. PIPA §22 명시 동의는 이미 별도 후속 작업(CMP-001a, PII_INVENTORY.md:200-208)으로 식별되어 있어 이중 작업 risk가 적음.

### 비권고: **A** — 의료 도구 특성상 false positive로 인한 출력 품질 저하 risk가 BL-B-014 완화 이익보다 크다고 판단. 단, 법무가 "한국 PIPA 가이드 권고가 인명 광범위 마스킹"이라 판단할 경우 재검토.

### 비권고: **D** — BL-B-014 발견이 미해소. 감사 보고서가 외부에 공개되거나 분쟁 발생 시 risk 노출.

**결정은 사용자 + 법무**. 본 ADR-1은 read-only 분석가. 옵션 A/B/C/D 또는 보류 중 하나를 PR 코멘트에 명시 요청.

---

## 6. 결정 후 후속 작업 (참고)

### 6.1 결정된 옵션의 구현 hook 지점 (file:line 표)

선택된 옵션의 마스킹 함수 `maskPII()`를 신규 `packages/blog-core/src/piiMask.ts`에 정의 후, 다음 지점에서 호출:

| # | 파일 | 라인 | hook 위치 |
|---|---|---|---|
| 1 | `packages/blog-core/src/llm/claude.ts` | :140 | `messages: [{ role: 'user', content: maskPII(req.userPrompt) }]` |
| 2 | `packages/blog-core/src/llm/gemini.ts` | :161 | `parts: [{ text: maskPII(req.userPrompt) }]` |
| 3 | `packages/blog-core/src/llm/claudeBatch.ts` | (Batch item user content) | 동일 |
| 4 | `public-app/app/api/gemini/route.ts` | :309, :310 (스트리밍 + 비스트리밍) | `body.prompt = maskPII(body.prompt)` |
| 5 | `public-app/app/api/image/route.ts` | OpenAI prompt 조립부 | OpenAI Image API 직전 |
| 6 | `public-app/lib/diagnostic/discovery.ts` | :521 | `messages: [{ role: 'user', content: maskPII(wrapAsQuestion(query)) }]` |
| 7 | `public-app/app/api/video/generate-subtitles/route.ts` | 응답 직전(transcript 후처리) | `text = maskPII(text)` |
| 8 | `public-app/app/api/landing-chat/route.ts` | :160 (prompt 조립) | |
| 9 | `public-app/app/api/help-chat/route.ts` | :262 | |
| 10 | `public-app/lib/clinicContextService.ts` | :63-115 (callGeminiForContext) | |
| 11 | `public-app/lib/keywordAnalysisService.ts` | :195, :276, :327, :436 | |
| 12 | `next-app/app/api/influencer/search/route.ts` | :225 | next-app은 내부 도구 — 적용 여부 별도 판단 |
| 13 | `next-app/app/api/influencer/generate-dm/route.ts` | :133 | 동일 |

→ 1·2·3 hook을 추가하면 `callLLM` 경유의 모든 호출(#1~9)이 단일 지점에서 커버됨. 직호출(#10~30)은 개별 hook 필요.

### 6.2 옵션별 LOC 추정

| 옵션 | piiMask.ts | hook 적용 | 동의 흐름·UI | 회귀 테스트 | 합계(추정) |
|---|---|---|---|---|---|
| A | 150 | 30 | (별도 PR) | 광범위 | 180 + 회귀 |
| B | 200 | 30 | (별도 PR) | 중간 | 230 + 회귀 |
| C | 200 | 50 | 250 | 큼 | 500 + 회귀 |
| D | 0 | 0 | 0 | 0 | 0 |

---

## 7. 미확인 / 후속 조사 필요

1. **OpenAI Chat Completions envelope** — `public-app/lib/diagnostic/discovery.ts:521` `messages: [{ role: 'user', content: ... }]`가 system 분리되어 있는지 추가 정독 필요. (본 ADR은 단일 user 메시지로만 확인.)
2. **OpenAI 데이터센터 위치 / 학습 데이터 사용 옵트아웃 여부** — Anthropic·OpenAI·Google 모두 API 데이터의 학습 사용 여부는 약관 상 옵트아웃이 가능하나 실제 설정 상태는 본 코드베이스에서 확인 불가. **법무·운영 확인 필요**.
3. **Anthropic Batch API 데이터 처리** — `claudeBatch.ts` 사용 시 batch 입력 파일의 보존 기간(Anthropic 측). 본 코드베이스 grep으로 확인 불가.
4. **Gemini Embedding 호출** — `blog_history.embedding VECTOR(768)` (`PII_INVENTORY.md:124-126`)는 Gemini Embedding API 사용. 본 ADR은 텍스트 생성 LLM에 집중. Embedding 호출 지점도 동일 정책 적용할지 별도 검토 필요.
5. **next-app 적용 범위** — 본 ADR은 public-app(외부 사용자) 중심. next-app(내부 도구)도 동일 마스킹 적용할지 사용자 결정.
6. **video-processor (Railway)** — `lib/videoProxy.ts:12-13`로 영상 파일 자체 외부 전송. 영상 콘텐츠는 마스킹 불가. 처리방침 위탁 고지로만 대응. 본 ADR 범위 외.
7. **diagnostic_history.url의 크롤링 본문** — `enrich.ts`가 외부 사이트 본문(환자 후기 가능)을 LLM에 전송. 본 본문도 마스킹 대상에 포함할지 결정 필요(BL-B-PII-003).
8. **hospital_images auto-tag의 이미지** — 텍스트 마스킹은 이미지에 적용 불가. 이미지 자동 마스킹(얼굴 흐림·차트 번호 OCR 검출 후 가림)은 별도 작업으로 분리(BL-B-PII-004).
9. **STT 음성 데이터** — 원본 음성은 마스킹 불가능. transcript 후처리 마스킹만 가능. 원본 음성 자체의 처리방침 위탁 고지 필수(법무).
10. **법령 적용** — PIPA 제17/22/28조, 의료법 §22, 개인정보 가명처리 가이드 적용 여부·범위는 **법무 검토 필수**. 본 ADR은 risk 표현만 사용.

---

## 8. 사용자 결정 요청

PR 코멘트에 다음 중 하나를 명시 요청:

- **A** — 공격적 마스킹
- **B** — 타겟 마스킹 (ADR-1 2순위)
- **C** — 타겟 마스킹 + 옵트인 (ADR-1 1순위 — B + C 병합)
- **D** — No-mask (현 상태 유지, 처리방침 텍스트만 강화)
- **보류** — 추가 조사 후 재논의

결정 후 별도 PR로 패치 작업이 이어진다.

---

## 9. 참고 자료 (read-only 인용)

- `docs/PII_INVENTORY.md` (PR #120)
- `docs/audits/blog/_findings_BL-B.md` BL-B-014, BL-B-PII-001..004
- `docs/AUDIT_REPORT.md` (베이스라인)
- `packages/blog-core/src/llm/{claude,claudeBatch,gemini,router,types,index}.ts`
- `packages/blog-core/src/promptSanitize.ts`
- `public-app/app/api/{gemini,llm,llm-smoke}/route.ts`
- `public-app/app/api/generate/{blog,blog/section,blog/review,clinical,card_news,press,youtube}/route.ts`
- `public-app/app/api/{landing-chat,help-chat,pexels-query,remove-bg}/route.ts`
- `public-app/app/api/diagnostic/competitor-gap/route.ts`
- `public-app/app/api/hospital-images/auto-tag/route.ts`
- `public-app/app/api/video/generate-subtitles/route.ts`
- `public-app/lib/{clinicalPrompt,clinicContextService,keywordAnalysisService,referenceFetcher}.ts`
- `public-app/lib/diagnostic/{discovery,enrich}.ts`
- `next-app/lib/geminiDirect.ts`, `next-app/app/api/influencer/{search,generate-dm}/route.ts`
- `public-app/app/api/image/route.ts` (OpenAI gpt-image-2)
