# 보강 가이드 (fix-todo) — 2026-05-15 (next-app)

생성: 2026-05-15T05:42:42.702Z
Supabase: https://goczdncrlslflzagsycj.supabase.co
라이브러리 표본: 120 개

## 요약

- HIGH (FAIL 매칭): **5** 건
- MEDIUM (자기 모순): **0** 건
- LOW (채움률 < 30%): **1** 카테고리

## 🔴 HIGH — FAIL 매칭 케이스 (즉시 보강)

### C3-botox — "보톡스 시술 부작용"

- 사유: top1 에 expectInclude (보톡스) 토큰 부재
- 잘못 매칭된 top1: `ebb37c81-04cd-49c5-a827-91b175770f1e` tags=[임플란트, 기사] alt="임플란트 시술 피해 관련 뉴스 기사 헤드라인과 통계표"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['보톡스']::text[]
 WHERE id = 'ebb37c81-04cd-49c5-a827-91b175770f1e';
```

또는 image-library 페이지에서 ebb37c81-04cd-49c5-a827-91b175770f1e 의 `excludeKeywords` 에 [보톡스] 추가.

### C4-filler — "필러 부작용 대처"

- 사유: top1 에 expectInclude (필러) 토큰 부재
- 잘못 매칭된 top1: `4b5be098-38ca-492e-977b-11adccef0971` tags=[보철, 기사] alt="보철물 삼킴 사고 대처법에 관한 치과 관련 신문 기사"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['필러']::text[]
 WHERE id = '4b5be098-38ca-492e-977b-11adccef0971';
```

또는 image-library 페이지에서 4b5be098-38ca-492e-977b-11adccef0971 의 `excludeKeywords` 에 [필러] 추가.

### C5-doubleeyelid — "쌍커풀 수술 회복"

- 사유: top1 에 expectInclude (쌍커풀) 토큰 부재
- 잘못 매칭된 top1: `c56dbb32-11ad-447d-a823-b6262c0838ee` tags=[수술, 의료진] alt="수술복을 입은 두 명의 의료진이 수술실에서 환자를 수술하고 있는 모습"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['쌍커풀']::text[]
 WHERE id = 'c56dbb32-11ad-447d-a823-b6262c0838ee';
```

또는 image-library 페이지에서 c56dbb32-11ad-447d-a823-b6262c0838ee 의 `excludeKeywords` 에 [쌍커풀] 추가.

### C6-rhinorevision — "코 재수술 주의사항"

- 사유: top1 에 expectInclude (코재수술|재수술|코수술) 토큰 부재
- 잘못 매칭된 top1: `25b2f6f4-a97c-4c8a-a4a7-2230f08adb87` tags=[임플란트, 수술] alt="광화문 선치과 무절개 임플란트 가이드임플란트 0.1mm의 오차 없이 식립 되는 디지털 임플란트 3D 스캐너를 활용하여 통증없이 빠르고 정확한 임플란트 식립이 가능합니다. 수술복을 입고 수술 중인 의사의 모습"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['코재수술', '재수술', '코수술']::text[]
 WHERE id = '25b2f6f4-a97c-4c8a-a4a7-2230f08adb87';
```

또는 image-library 페이지에서 25b2f6f4-a97c-4c8a-a4a7-2230f08adb87 의 `excludeKeywords` 에 [코재수술, 재수술, 코수술] 추가.

### C7-discnonop — "디스크 비수술 치료"

- 사유: top1 에 expectInclude (디스크|비수술) 토큰 부재
- 잘못 매칭된 top1: `c9673677-c858-471d-bcfb-82f07c0bd602` tags=[턱관절, 일반] alt="광화문 선치과의 1:1 맞춤 치료 안내 이미지. 약물·물리치료·보톡스, 스프린트 장치, 생활습관 교정 세 가지 치료 방법을 소개하고 있습니다."

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['디스크', '비수술']::text[]
 WHERE id = 'c9673677-c858-471d-bcfb-82f07c0bd602';
```

또는 image-library 페이지에서 c9673677-c858-471d-bcfb-82f07c0bd602 의 `excludeKeywords` 에 [디스크, 비수술] 추가.

## 🟡 MEDIUM — 자기 모순 (excludeKeywords ↔ 자체 tags 겹침)

없음 ✅
## 🟢 LOW — 채움률 < 30% 카테고리 (장기 보강)

| category | total | filled | fill% |
|---|---|---|---|
| unknown | 120 | 0 | 0.0% |

보강 방법:
1. 해당 카테고리 병원의 image-library 페이지에서 운영자 수동 보강.
2. `scripts/migrate-image-exclusions.ts` 의 confusable boost rule 자동 제안 list 참조.

## 검증 후 재실행 권장

보강 적용 후 동일 명령 재실행 → HIGH=0 / MEDIUM=0 으로 수렴 확인:

```bash
npx tsx scripts/build-image-fix-todo.ts
```

## 결론

❌ HIGH 5 건 — 마이그레이션 후 보강 미흡. 위 SQL/UI 가이드로 즉시 처리 필요.
