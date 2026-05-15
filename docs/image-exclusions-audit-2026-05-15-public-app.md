# 이미지 라이브러리 audit — 2026-05-15 (public-app)

생성: 2026-05-15T05:45:19.175Z
Supabase: https://oljcrtavpbbobzqwfkcg.supabase.co

## 요약

- 전체 이미지: **123** 개
- excludeKeywords 채워진 이미지: **0** 개 (0.0%)
- 자기 모순 이상치: **0** 건 ✅
- 카테고리 매핑 (hospitals.category): unknown (테이블 없음 또는 매핑 실패)

## 카테고리별 채움률

| category | total | with exclude_keywords | fill rate |
|---|---|---|---|
| unknown | 123 | 0 | 0.0% |

## 상위 빈도 excludeKeywords (top 20)

| token | count |
|---|---|

## 자기 모순 이상치

없음 ✅

## 다음 단계

1. 채움률 낮은 카테고리 → image-library 페이지 또는 SQL UPDATE 로 운영자 수동 보강.
2. 자기 모순 이상치 있으면 → 즉시 fix (자기 차단은 무의미). image-library 페이지에서 해당 image 의 excludeKeywords 삭제.
3. 매칭 시뮬레이션 결과 (`docs/image-matching-simulation-*.md`) 와 cross-check → 미흡한 보강 항목은 `docs/image-exclusions-fix-todo-*.md` 에 정리됨.
