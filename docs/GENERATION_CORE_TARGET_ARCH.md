# 생성 코어 목표 아키텍처

## 현재 생성 플로우

```
App.tsx
  └─ useContentGeneration.handleGenerate(request)
       └─ geminiService.generateFullPost(request, onProgress)
            ├─ postType 라우팅 (blog/card_news/press_release)
            ├─ 검색: searchKDCA(), searchHospitalSites(), searchGoogle()
            ├─ Stage A: 아웃라인 생성 (FLASH, 30s)
            ├─ Stage B: 섹션 생성 (FLASH, 25s/섹션, batch=2)
            ├─ Stage C: 폴리시 (FLASH, 12s, 비동기)
            ├─ 이미지 생성 (image/imageOrchestrator)
            ├─ FAQ 생성 (선택)
            ├─ AI smell check
            ├─ HTML 조립: 이미지 삽입 + CSS 래핑 + 면책조항
            ├─ Supabase 업로드 (image/imageStorageService)
            └─ 히스토리 저장 (contentSimilarityService)
```

### 현재 문제
- geminiService.ts **4,170줄**에 위 모든 책임이 혼재
- 검색(KDCA/병원/구글)이 생성 서비스 안에 임베딩
- HTML 조립(이미지삽입/CSS래핑/면책조항)이 생성과 섞임
- FAQ 생성이 별도 서비스가 아님
- AI smell check가 인라인

## 목표 생성 플로우

```
useContentGeneration.handleGenerate(request)
  ├─ 크레딧 차감 (3/29 활성화)
  └─ geminiService.generateFullPost(request, onProgress)
       ├─ postType 라우팅 (유지)
       ├─ searchService.searchForTopic() ← 추출
       ├─ Stage A/B/C 파이프라인 (유지, geminiService 핵심)
       ├─ image/* 오케스트레이션 (유지, 이미 분리됨)
       ├─ resultAssembler.assembleResult() ← 추출
       │    ├─ 이미지 삽입
       │    ├─ HTML 래핑 + CSS
       │    ├─ 면책조항
       │    └─ FAQ 통합
       └─ postProcessingService (이미 존재, 활용 확대)
```

## 요청/응답 계약

### GenerationRequest (기존 타입, 변경 없음)
```typescript
// src/types.ts에 이미 정의됨
interface GenerationRequest {
  topic: string;
  keywords: string;
  category: ContentCategory;
  postType: PostType;
  imageStyle: ImageStyle;
  imageCount?: number;
  textLength?: number;
  // ... 기존 필드 유지
}
```

### GeneratedContent (기존 타입, 변경 없음)
```typescript
interface GeneratedContent {
  title: string;
  htmlContent: string;
  fullHtml: string;
  tags: string[];
  postType: PostType;
  imageFailCount?: number;
  fact_check?: FactCheckReport;
  seoScore?: SeoScoreReport;
  // ... 기존 필드 유지
}
```

### 크레딧 차감 삽입점
```
useContentGeneration.ts:118-149 (현재 주석 처리)
  → deductCreditOnServer(request.postType)
  → 성공 시 generateFullPost() 호출
  → 실패 시 에러 표시, 생성 중단
```

## Fallback/Timeout 위치 (보존)

| 경계 | 위치 | 전략 |
|------|------|------|
| Stage A 아웃라인 | geminiService:706 | 30s + retry 2회 |
| Stage B 섹션 | geminiService:749 | 25s/섹션 + placeholder fallback |
| Stage C 폴리시 | geminiService:968 | 12s + non-blocking (실패시 raw HTML) |
| 이미지 큐 | image/imageOrchestrator | tier별 세마포어 + 35s/45s wall-time |
| 전체 생성 | useContentGeneration:178 | 150s hard timeout |

**핵심**: 이 fallback/timeout 전략은 이미 잘 작동하므로 **절대 변경하지 않는다**.

## 마이그레이션 단계

### Step 1: 검색 함수 추출
- `searchKDCA()`, `searchHospitalSites()`, `searchGoogle()`, `crawlUrl()` →
  `src/services/searchService.ts`
- geminiService에서 import로 전환
- 동작 변경 없음

### Step 2: HTML 조립/후처리 추출
- 이미지 삽입 로직 (lines 3550-3602)
- HTML 래핑 + CSS (lines 3632-3735)
- FAQ 통합 (lines 3740-3805)
- AI smell check 통합 (lines 3863-3896)
- → `src/services/resultAssembler.ts`
- geminiService에서 import로 전환

### Step 3: 검증
- 빌드/타입체크
- 대표 블로그 생성 플로우 동작 확인
- geminiService 줄 수 감소 확인

## 추출하지 않는 것

- Stage A/B/C 파이프라인 로직 (geminiService 핵심 책임)
- postType 라우팅 (generateFullPost의 핵심)
- onProgress 콜백 체계 (전체에 걸쳐 있음)
- 프롬프트 선택/조합 (파이프라인과 밀접)
