# 이미지 라이브러리 — `exclude_keywords` 운영자 보강 가이드

## 배경

`packages/blog-core/src/imageMatcher.ts` 의 매칭 로직에 **배제 키워드** 축을 추가했다. 같은 태그 (`치과`, `시술`, `발치`) 를 공유하는 confusable 쌍 — 임플란트 vs 사랑니, 도수치료 vs 추나요법, 라식 vs 라섹 등 — 을 분리하기 위함.

## 어떻게 작동하나

이미지 record 에 `excludeKeywords: string[]` 필드 (DB 컬럼 `exclude_keywords`). 매칭 시 글 컨텍스트 (title / bodyKeywords) 에 배제 키워드가 1개라도 포함되면 그 이미지는 후보에서 즉시 제외 (score = -Infinity).

예시:
- 사랑니 이미지 — `tags: ['사랑니', '발치', '치과']`, `excludeKeywords: ['임플란트']`
- 임플란트 이미지 — `tags: ['임플란트', '치과', '시술']`, `excludeKeywords: ['사랑니']`

글 "임플란트 식립 후 관리" → 사랑니 이미지의 excludeKeywords '임플란트' 가 title 키워드 '임플란트' 와 매칭 → 사랑니 이미지 제외. 임플란트 이미지만 후보.

## 적용 절차

### 1) DB 컬럼 추가 (1회) — SQL Editor 에서 직접 실행

두 Supabase 프로젝트 (winaid-internal-seoul / winaid-public-seoul) 각각 다음 SQL 파일을 Dashboard → SQL Editor 에서 실행:

- `sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql` → winaid-internal-seoul (next-app)
- `public-app-sql/migrations/2026-05-15_hospital_images_exclude_keywords.sql` → winaid-public-seoul (public-app)

본 파일은 idempotent (`IF NOT EXISTS`) — 재실행해도 안전.

### 2) 자동 제안 생성 — 분석 전용 (DB 변경 X)

DB 컬럼이 추가된 후, 운영자가 어떤 이미지에 어떤 excludeKeywords 를 boost 하면 좋을지 자동 제안을 생성:

```bash
# 양 Supabase 인스턴스 각각 실행 (env 분리)
SUPABASE_URL=https://winaid-internal-seoul.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/migrate-image-exclusions.ts
# → docs/image-library-exclusion-suggestions.md (next-app pool)

SUPABASE_URL=https://winaid-public-seoul.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  npx tsx scripts/migrate-image-exclusions.ts
# → docs/image-library-exclusion-suggestions.md (public-app pool, 이전 파일 덮어씀 — 미리 백업)
```

스크립트는 select-only — DB 변경 안 함. 출력은 table 형식 + UPDATE SQL 예시.

스크립트는 다음 boost rule 로 제안:

| 이미지 태그에 X 가 있으면 | 다음을 excludeKeywords 에 추가 제안 |
|---|---|
| 임플란트 | 사랑니 |
| 사랑니 | 임플란트 |
| 도수치료 | 추나요법 |
| 추나요법 | 도수치료 |
| 라식 | 라섹, 스마일라식 |
| 라섹 | 라식, 스마일라식 |
| 치아교정 | 치아미백, 라미네이트 |
| 치아미백 | 치아교정, 라미네이트 |

자동 적용은 **안 함** — false-positive 우려 (병원에 따라 라식+라섹 동시 시술 이미지일 수도). 운영자가 확인 후 수동 적용.

### 3) 운영자 수동 보강 — image-library 페이지

`/(dashboard)/image-library` 페이지에 `exclude_keywords` 편집 UI 추가 (별도 PR). 운영자가 이미지별로 직접 추가/삭제.

현재 페이지는 `tags` / `altText` / `aiDescription` 만 노출 — `exclude_keywords` UI 가 추가될 때까지 자동 제안 list 를 SQL 콘솔에서 직접 적용:

```sql
UPDATE hospital_images
   SET exclude_keywords = ARRAY['사랑니']::text[]
 WHERE id = '<image_id>';
```

## 매칭 외 다른 보호 축 (참고)

`imageMatcher.ts` 는 excludeKeywords 외에도:
- **Specificity weighting** — `exact` (1.0) > `edge` prefix/suffix (0.5) > `substring` (0.2). "임플란트" 정확 일치가 "치과" substring 보다 5배 가중.
- **Title-first** — 글 제목 키워드 3x 가중. 본문 키워드 1x.
- **lowPriorityTags downgrade** — `일반/로고/외관/대기실/기사` 만 보유한 이미지는 점수 70% 감산.

따라서 excludeKeywords 보강 없이도 정확도 개선됨. excludeKeywords 는 **최후 방어선** — 특히 alt 텍스트가 confusable 표현을 포함한 경우 (예: "치과 시술 모습" — 임플란트인지 사랑니인지 alt 만으로는 모름).

## 회귀 테스트

`packages/blog-core/src/__tests__/imageMatcher.test.ts` 가 confusable 쌍 분리 invariant 강제:
- "임플란트 식립 후 관리" → 임플란트 이미지 top 1
- "사랑니 발치 회복" → 사랑니 이미지 top 1
- excludeKeywords 매칭 시 즉시 제외 (score = -Infinity)
- exact > edge > substring 가중치 순서

## 후속 백로그

- `image-library` 페이지에 `exclude_keywords` 편집 UI 추가 (별도 PR)
- `auto-tag` 라우트에서 Gemini Vision 응답에 confusable 후보 자동 제안 (예: 이미지에 임플란트 식립이 보이면 `excludeKeywords: ['사랑니']` 자동 기록)
- 카테고리별 boost rule 확장 (피부과 / 성형외과 / 정형외과 / 내과 / 한의원 / 안과 confusable)
