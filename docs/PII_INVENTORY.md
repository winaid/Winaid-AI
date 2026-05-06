# PII 인벤토리 — Winaid-AI public-app

**작성일**: 2026-05-06
**작성자**: CMP-001a (개인정보처리방침 골격 작업의 사전 산출물)
**스캔 범위**: `public-app/`, `packages/blog-core/`, `sql/`, `public-app-sql/`, `supabase/schema.sql`, `.env.example`
**스캔 방법**: read-only grep + 코드 정독 (소스 변경 없음)
**제외**: `next-app/` (내부 운영 도구. 본 PR 범위 밖)

> ⚠️ **본 문서의 성격**
> - 모든 항목은 **실제 코드 grep 결과만** 반영. 추측은 "확인 필요" 명시.
> - 보유 기간·법적 근거는 본 문서에서 정의하지 않음 — 법무 검토 후 개인정보처리방침 본문에서 정의.
> - 본 문서는 PIPA(개인정보보호법) 처리방침 작성을 위한 **사실 정리표**.

---

## 1. 요약 — PII 카테고리

| # | 카테고리 | 보관 위치 | 코드 grep 근거 |
|---|---|---|---|
| 1 | 인증/식별 (이메일, 비밀번호 해시) | `auth.users` (Supabase) | `signUpWithEmail`/`signInWithPassword` (`public-app/lib/auth.ts:18,39`) |
| 2 | 프로필 (이름, 병원명, 홈페이지 URL, 병원주소, 아바타) | `public.profiles`, `auth.users.raw_user_meta_data` | `auth.ts:35-67`, `auth/page.tsx:309-385`, `mypage/page.tsx:97-173`, `sql/bootstrap_new_supabase.sql:40-53` |
| 3 | IP 해시 | `profiles.ip_hash`, `generated_posts.ip_hash` | `sql/bootstrap_new_supabase.sql:50,144`, `public-app/lib/guestRateLimit.ts:59-61` |
| 4 | 사용자 생성 콘텐츠 (블로그/카드뉴스/보도자료 본문, 키워드, 의사명/직함) | `public.generated_posts` | `sql/bootstrap_new_supabase.sql:140-162` |
| 5 | 결제·구독 정보 | `public.subscriptions`, `public.payments` (legacy) | `sql/bootstrap_new_supabase.sql:109-118`, `supabase/schema.sql:74-87` |
| 6 | 사용량 로그 (action, metadata, token usage) | `public.api_usage_logs`, `public.usage_logs`, `public.usage_history` | `sql/bootstrap_new_supabase.sql:332-374`, `supabase/schema.sql:51-58` |
| 7 | 의료 사이트 진단 결과 | `diagnostic_history` (URL, 점수, 분석결과 JSON) | `sql/migrations/2026-04-17_diagnostic_history.sql` |
| 8 | 병원 이미지 업로드 (의료법상 환자 식별 가능성 있음) | `hospital_images` 테이블 + Supabase Storage `hospital-images` 버킷 | `sql/migrations/2026-04-17_hospital_images.sql`, `app/api/hospital-images/upload/route.ts` |
| 9 | 영상 업로드 (얼굴/음성 포함 가능) | Railway `video-processor` 서버 (DB 미보관, 임시 처리 후 응답 반환) | `lib/videoProxy.ts:12-13`, `app/(dashboard)/video_edit/page.tsx:265-270` |
| 10 | 외부 블로그 크롤링 결과 (말투 학습용) | `hospital_style_profiles`, `hospital_crawled_posts` | `sql/bootstrap_new_supabase.sql:194-326` |
| 11 | 사용자 작성 블로그 이력·임베딩 (유사도 검사) | `blog_history` (pgvector) | `sql/bootstrap_new_supabase.sql:380-405` |
| 12 | 내부 피드백 (사용자명·작성 본문) | `internal_feedbacks` | `sql/migrations/2026-03-24_internal_feedbacks.sql` |
| 13 | 인플루언서 아웃리치 (외부 SNS 사용자명·DM) | `influencer_outreach` | `sql/migrations/2026-04-08_influencer_outreach.sql` |
| 14 | LLM 프롬프트 입력 (병원명·진료 사례 텍스트 등) | 외부 전송 (Anthropic, Google Gemini, OpenAI) | `app/api/gemini/route.ts:95`, `lib/diagnostic/discovery.ts:20`, `app/api/generate/blog/route.ts:247`, `.env.example:69-79` |
| 15 | 클라이언트 LocalStorage (저장된 이메일) | 브라우저 localStorage `winaid_remember_email` | `app/auth/page.tsx:28-30,130` |
| 16 | 서버 로그 평문 userId 유출 (12개 라우트) | Railway/Vercel 서버 로그 | `OPS-007` (감사 보고서) — `app/api/image/route.ts:658`, `app/api/generate/{blog,blog/section,clinical,press,youtube}/route.ts`, `app/api/video/{add-bgm,add-sound-effects}/route.ts` |

---

## 2. 항목별 상세

### 2.1 인증/식별 (auth.users)

| 항목 | 코드 위치 | 비고 |
|---|---|---|
| email | `auth/page.tsx:259-265` (회원가입 form) → `auth.signUp({email, ...})` (`lib/auth.ts:39-43`) | Supabase가 평문 보관 |
| password | `auth/page.tsx:268-275` → `auth.signUp({password})` | Supabase가 bcrypt 해시 보관 (코드 직접 저장 없음) |
| user_metadata.name | `lib/auth.ts:35` (회원가입 시 병원명 입력값을 `name`으로 저장) | UI 라벨은 "병원명"이지만 metadata 키는 `name` |
| user_metadata.homepage_url | `lib/auth.ts:36`, `auth/page.tsx:362-372` | 선택 입력 |
| user_metadata.address | `lib/auth.ts:37`, `auth/page.tsx:374-384` | 선택 입력 (병원 주소) |
| user_metadata.hospital_name | `mypage/page.tsx:154` (수정 시) | 마이페이지에서 별도 키로 저장 |
| user_metadata.avatar_url | `supabase/schema.sql:104-110` (handle_new_user 트리거) | OAuth 가입 시 자동 |
| created_at, last_sign_in_at | Supabase 기본 컬럼 | 코드에서 직접 read 안 하나 dashboard 노출 |

### 2.2 public.profiles

`public-app-sql/bootstrap_new_supabase.sql:40-53`에 정의된 컬럼:
- `id` (auth.users.id 참조), `email`, `full_name`, `name`, `avatar_url`
- `team_id`, `plan`, `remaining_credits`, `plan_expires_at`
- `ip_hash` — 첫 가입 시 SHA256 해시 IP (`schema.sql:15` 코멘트)
- `created_at`, `updated_at`

추가로 `lib/auth.ts:53-67`이 `homepage_url`, `address` 컬럼을 `profiles`에도 update — bootstrap SQL에는 정의가 없음. **확인 필요**: 컬럼이 운영 DB에만 ALTER로 추가되었는지.

**RLS 노트** (감사 CAT-DB-037): `bootstrap_new_supabase.sql:64-65`의 `"Anon can view profiles" FOR SELECT USING (true)` — anon이 전체 profiles SELECT 가능. **PIPA 위반 risk** (별도 수정 PR 필요).

### 2.3 IP 해시

- `lib/guestRateLimit.ts:59-61` — `x-forwarded-for` / `x-real-ip` 헤더에서 IP 추출
- `supabase/schema.sql:35` 코멘트 — "SHA256 해시된 IP"
- 저장처: `profiles.ip_hash`, `generated_posts.ip_hash`, (legacy) `ip_usage.ip_hash`, `usage_history.ip_hash`
- **확인 필요**: 실제 SHA256 해시 호출 코드 위치 — `public-app/lib/`, `packages/`에서 `createHash` grep 결과 hit 없음. `app/api/diagnostic/stream/route.ts:45`의 `sha256`은 query 캐시 키 용도이지 IP용 아님. IP 해시 로직이 RPC 측에 있는지 또는 미구현인지 추가 확인 필요.

### 2.4 generated_posts (사용자 생성 콘텐츠)

`public-app-sql/bootstrap_new_supabase.sql:140-162`:
- `user_id`, `user_email` (평문 이메일이 별도 컬럼으로 중복 저장됨)
- `ip_hash`
- `hospital_name`, `category`, `doctor_name`, `doctor_title` — 의료진 식별 정보 가능
- `post_type` (blog/card_news/press_release), `workflow_type` (generate/refine)
- `title`, `content`, `plain_text`, `keywords[]`, `topic`, `image_style`
- `slide_count`, `char_count`, `word_count`, `created_at`, `updated_at`

**RLS 노트** (감사 CAT-DB-037 관련): `Anon can view posts FOR SELECT USING (true)` (`bootstrap_new_supabase.sql:176-177`) — 전 사용자 본문/이메일 노출 risk.

### 2.5 결제·구독

- `subscriptions` (`bootstrap_new_supabase.sql:109-118`): `user_id`, `plan_type`, `credits_total`, `credits_used`, `expires_at`
- `payments` (legacy `supabase/schema.sql:74-87`): `user_id`, `amount` (원화), `payment_method`, `payment_provider` (toss/kakaopay/naverpay), `transaction_id`, `status`, `metadata`
- **확인 필요**: 실제 결제 PG 연동 코드 grep 결과 hit 없음. 결제 흐름이 미구현인지 또는 외부에 있는지 확인 필요.

### 2.6 사용량 로그

- `api_usage_logs` (`bootstrap_new_supabase.sql:332-353`): `user_id`, `total_calls`, `total_input_tokens`, `total_output_tokens`, `total_cost_usd`, `details` (JSONB)
- `usage_logs` (`bootstrap_new_supabase.sql:359-374`): `user_id`, `action`, `metadata` (JSONB)
- `usage_history` (legacy `schema.sql:51-58`): `user_id`, `action_type`, `credits_used`, `ip_hash`, `metadata`

### 2.7 진단 이력 (diagnostic_history)

`sql/migrations/2026-04-17_diagnostic_history.sql`:
- `user_id` (게스트면 NULL), `url` (의료기관 사이트 URL), `site_name`, `overall_score`, `categories` (JSONB), `ai_visibility` (JSONB), `hero_summary`, `analyzed_at`

### 2.8 hospital_images 업로드

- `sql/migrations/2026-04-17_hospital_images.sql`: `user_id`, `hospital_name`, `storage_path`, `original_filename`, `file_size`, `mime_type`, `width`, `height`, `tags[]`
- 실제 파일: Supabase Storage `hospital-images` 버킷 (`app/api/hospital-images/upload/route.ts:44`)
- **PIPA·의료법 risk**: `app/(dashboard)/clinical/page.tsx:331-332,448-449` — UI에 환자 식별 정보 제거 안내 + 사용자 동의 체크박스가 이미 있음. 자동 검열은 없음 (사용자 책임 모델).
- 업로더가 환자 얼굴/이름/차트번호/생년월일을 포함한 이미지를 업로드할 가능성 있음 — 처리방침에 의료법·환자 동의 의무 명시 필요. **[TODO: 법무 검토]**

### 2.9 영상 업로드 (video-processor)

- `lib/videoProxy.ts:12-13` — `NEXT_PUBLIC_VIDEO_PROCESSOR_URL` (Railway 인스턴스)로 영상 파일 전송
- `app/(dashboard)/video_edit/page.tsx:265-270` — `formData.append('file', file)` (사용자 업로드 영상)
- **DB 보관 없음** — video-processor는 처리 후 결과 영상만 응답. 단, 처리 중 임시 저장 가능성 있음. **확인 필요** (video-processor 코드 본 PR 범위 밖).
- 사용자 얼굴/음성 포함 가능. STT(자막 생성)는 Google Cloud Speech-to-Text 사용 (`.env.example:33-37`, `app/api/video/generate-subtitles/route.ts:131-175`).

### 2.10 외부 블로그 크롤링

- `hospital_style_profiles` (`bootstrap_new_supabase.sql:196-207`): `hospital_name`, `naver_blog_url`, `style_profile` (JSONB), `raw_sample_text` (최대 10000자)
- `hospital_crawled_posts` (`bootstrap_new_supabase.sql:240-259`): `hospital_name`, `url`, `content`, `title`, `summary`, `thumbnail`, `score_*`, `corrected_content` 등
- 출처: 사용자가 입력한 자기 병원 네이버 블로그 URL — 본인이 발행한 공개 게시글
- **확인 필요**: 크롤링 대상이 자기 블로그로 제한되는지 / 제3자 블로그도 크롤링 가능한지 검토 필요 (별도 검토 영역)

### 2.11 blog_history (벡터 임베딩)

- `bootstrap_new_supabase.sql:380-405`: `user_id`, `title`, `content` (HTML 제거 텍스트), `html_content`, `keywords[]`, `embedding VECTOR(768)` (Gemini Embedding), `naver_url`, `category`, `published_at`

### 2.12 internal_feedbacks

- `sql/migrations/2026-03-24_internal_feedbacks.sql`: `user_id`, `user_name`, `content`, `page` — 사용자 피드백 본문에 PII 자가 입력 가능

### 2.13 influencer_outreach

- `sql/migrations/2026-04-08_influencer_outreach.sql`: `hospital_name`, `username` (외부 SNS), `full_name`, `follower_count`, `engagement_rate`, `estimated_location`, `dm_message`, `status`
- **확인 필요**: 본 테이블이 public-app에서 사용 중인지 / next-app(내부 도구) 전용인지. 본 PR은 public-app 범위 — 사용처 grep 추가 검토 필요. 처리방침에 포함할지 법무 판단 필요.

### 2.14 LLM 외부 전송 (제3자 제공이 아닌 위탁)

| 외부 서비스 | 엔드포인트/SDK | 전송 데이터 | 코드 위치 |
|---|---|---|---|
| Google Gemini | `generativelanguage.googleapis.com/v1beta/models/.../generateContent` | 사용자 입력 prompt (블로그 주제, 병원명, 카드뉴스 본문, 진단 결과 분석 등) | `app/api/gemini/route.ts:95,306`, `app/api/landing-chat/route.ts:160`, `app/api/help-chat/route.ts:262`, `app/api/hospital-images/auto-tag/route.ts:180`, `app/api/pexels-query/route.ts:15`, `app/api/remove-bg/route.ts:58`, `lib/diagnostic/discovery.ts:667` |
| Anthropic Claude | `@anthropic-ai/sdk` (`claude-sonnet-4-6` 외) | 블로그/카드뉴스/보도자료 본문 생성 prompt | `app/api/generate/blog/route.ts:247`, `.env.example:69-77` |
| OpenAI | `api.openai.com/v1/chat/completions` + Image API (gpt-image-2) | 진단 (ChatGPT 실측), 이미지 생성 prompt | `lib/diagnostic/discovery.ts:20`, `.env.example:104-118` |
| Google Cloud Speech-to-Text | googleapis (자격증명 JSON) | 영상 음성 전송 → STT 변환 | `app/api/video/generate-subtitles/route.ts:131-175`, `.env.example:33-37` |
| remove.bg | `api.remove.bg/v1.0/removebg` | 이미지 배경 제거 | `app/api/remove-bg/route.ts:37` |
| 네이버 검색 API | developers.naver.com | 검색어 query만 (PII 없음) | `app/api/naver/{search,news,keyword-stats,crawl-hospital-blog}/route.ts` |
| Pexels / Pixabay / Google CSE | 각 검색 API | 검색어 query만 (PII 없음) | `app/api/pexels/route.ts`, `app/api/pixabay/route.ts` |
| Jamendo / HuggingFace | BGM 검색 / 음악 생성 | 검색어/생성 prompt | `.env.example:43-50` |
| Railway: video-processor | `NEXT_PUBLIC_VIDEO_PROCESSOR_URL` | 사용자 업로드 영상 전송 (얼굴·음성 포함 가능) | `lib/videoProxy.ts:12`, `lib/videoClient.ts:16` |
| Railway: crawler-server | `NEXT_PUBLIC_CRAWLER_URL` | 네이버 블로그 URL → 크롤링 결과 반환 | `.env.example:17` |
| Supabase | `*.supabase.co` | 모든 DB·인증·Storage 데이터 (위탁 처리) | `.env.example:6-7` |

### 2.15 클라이언트 LocalStorage

- `winaid_remember_email`: `app/auth/page.tsx:28-30,130-132` — "로그인 정보 기억" 체크 시 이메일 평문 보관

### 2.16 서버 로그 평문 userId (OPS-007)

- 로그에 user UUID 평문 출력되는 12개 라우트 — 감사 보고서 `OPS-007` (`docs/audit/_findings_F_deps_compliance_ops.md:52`).
- 본 grep으로 확인된 6+ 패턴:
  - `app/api/image/route.ts:658`
  - `app/api/generate/blog/route.ts:109`
  - `app/api/generate/blog/section/route.ts:81`
  - `app/api/generate/clinical/route.ts:88`
  - `app/api/generate/press/route.ts:83`
  - `app/api/generate/youtube/route.ts:80`
  - `app/api/video/add-bgm/route.ts:67`, `app/api/video/add-sound-effects/route.ts:79` (해시 마스킹: `userId.slice(0, 8)`)

---

## 3. Supabase Storage 버킷

| 버킷 | 정책 | 코드 근거 |
|---|---|---|
| `blog-images` | public read, authenticated/anon upload | `bootstrap_new_supabase.sql:659-679` |
| `hospital-images` | 정책 변경 이력 다수 (`2026-04-29_image_library_team_share.sql:151-174`) | `app/api/hospital-images/upload/route.ts:44` |
| `feedback-images` | public, authenticated upload | `sql/migrations/2026-03-31_feedback_images.sql` |

---

## 4. 보유 기간 — 확인 필요 / 법무 정의 대상

코드에서 자동 삭제 로직 grep 결과:
- `hospital_crawled_posts` — 출처 블로그별 10건 초과 시 자동 삭제 (`bootstrap_new_supabase.sql:301-316` 트리거).
- 그 외 자동 만료/삭제 로직은 grep 결과 없음. 모든 항목이 사실상 무기한 보유 중.

**[TODO: 법무 검토]** — PIPA에 따른 보유 기간을 항목별로 법무팀이 정의해야 함.

---

## 5. 수집 동의 (현재 상태 — 사실)

- 회원가입 시 동의 체크박스 grep 결과: `auth/page.tsx`에 별도 동의 체크박스 없음. 가입 버튼 클릭 = 묵시적 동의 모델.
- `clinical/page.tsx:331-332,448-449` — 환자 식별 정보 업로드에 한정한 사용자 동의 텍스트만 존재 (필수 동의 UI는 없음).
- **[TODO: 법무 검토]** — PIPA 제15조에 따른 명시적 동의 절차 추가 여부.

---

## 6. 본 인벤토리에서 도출된 후속 작업 후보 (별도 PR)

1. **CMP-001a (본 PR)** — 처리방침 페이지 골격 + 본 인벤토리.
2. **CMP-001b (별도)** — 회원탈퇴 흐름 (DB 삭제 + 보존의무 데이터 처리).
3. **CMP-001c 후보** — 쿠키 배너 / 동의 관리.
4. **CAT-DB-037 수정** — `Anon can view profiles/generated_posts` RLS 제거.
5. **OPS-007 수정** — 평문 userId 로그를 해시 마스킹으로 변경 (12 라우트).
6. **보유 기간 자동 만료** — 법무 결정 후 cron/RPC.
7. **회원가입 동의 체크박스** — UX 변경.

위 항목들은 본 PR 범위 밖. 인벤토리 결과로 식별된 후보 작업.
