# 보강 가이드 (fix-todo) — 2026-05-15 (public-app)

생성: 2026-05-15T05:45:22.258Z
Supabase: https://oljcrtavpbbobzqwfkcg.supabase.co
라이브러리 표본: 123 개

## 요약

- HIGH (FAIL 매칭): **3** 건
- MEDIUM (자기 모순): **0** 건
- LOW (채움률 < 30%): **1** 카테고리

## 🔴 HIGH — FAIL 매칭 케이스 (즉시 보강)

### C5-doubleeyelid — "쌍커풀 수술 회복"

- 사유: top1 에 expectInclude (쌍커풀) 토큰 부재
- 잘못 매칭된 top1: `6e47a154-14b5-4e75-a38a-402cf3eee444` tags=[임플란트, 수술, 진료실] alt="치과 진료실에서 의료진이 임플란트 수술을 준비하거나 진행하고 있는 모습"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['쌍커풀']::text[]
 WHERE id = '6e47a154-14b5-4e75-a38a-402cf3eee444';
```

또는 image-library 페이지에서 6e47a154-14b5-4e75-a38a-402cf3eee444 의 `excludeKeywords` 에 [쌍커풀] 추가.

### C6-rhinorevision — "코 재수술 주의사항"

- 사유: top1 에 expectInclude (코재수술|재수술|코수술) 토큰 부재
- 잘못 매칭된 top1: `6e47a154-14b5-4e75-a38a-402cf3eee444` tags=[임플란트, 수술, 진료실] alt="치과 진료실에서 의료진이 임플란트 수술을 준비하거나 진행하고 있는 모습"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['코재수술', '재수술', '코수술']::text[]
 WHERE id = '6e47a154-14b5-4e75-a38a-402cf3eee444';
```

또는 image-library 페이지에서 6e47a154-14b5-4e75-a38a-402cf3eee444 의 `excludeKeywords` 에 [코재수술, 재수술, 코수술] 추가.

### C7-discnonop — "디스크 비수술 치료"

- 사유: top1 에 expectAvoid 토큰 "수술" 포함
- 잘못 매칭된 top1: `6e47a154-14b5-4e75-a38a-402cf3eee444` tags=[임플란트, 수술, 진료실] alt="치과 진료실에서 의료진이 임플란트 수술을 준비하거나 진행하고 있는 모습"

**제안 fix** (확인 후 실행):

```sql
-- top1 이미지에 expectInclude 외 토큰이 매칭 ← excludeKeywords 보강 권장
UPDATE hospital_images
   SET exclude_keywords = exclude_keywords || ARRAY['디스크', '비수술']::text[]
 WHERE id = '6e47a154-14b5-4e75-a38a-402cf3eee444';
```

또는 image-library 페이지에서 6e47a154-14b5-4e75-a38a-402cf3eee444 의 `excludeKeywords` 에 [디스크, 비수술] 추가.

## 🟡 MEDIUM — 자기 모순 (excludeKeywords ↔ 자체 tags 겹침)

없음 ✅
## 🟢 LOW — 채움률 < 30% 카테고리 (장기 보강)

| category | total | filled | fill% |
|---|---|---|---|
| unknown | 123 | 0 | 0.0% |

보강 방법:
1. 해당 카테고리 병원의 image-library 페이지에서 운영자 수동 보강.
2. `scripts/migrate-image-exclusions.ts` 의 confusable boost rule 자동 제안 list 참조.

## 검증 후 재실행 권장

보강 적용 후 동일 명령 재실행 → HIGH=0 / MEDIUM=0 으로 수렴 확인:

```bash
npx tsx scripts/build-image-fix-todo.ts
```

## 결론

❌ HIGH 3 건 — 마이그레이션 후 보강 미흡. 위 SQL/UI 가이드로 즉시 처리 필요.
