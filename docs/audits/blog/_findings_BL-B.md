# BL-B — 의료광고법 검증기 + 컴플라이언스 감사 (False Negative 중심)

- 감사 범위: `public-app/lib/medicalAdValidation.ts`, `packages/blog-core/src/medicalLawFilter.ts`, `packages/blog-core/src/medicalLawRules.ts`, 호출 경로 (블로그 5단계 / 카드뉴스 SlideEditor·CardNewsProRenderer / 영상 자막 STT 라우트), 그리고 `docs/PII_INVENTORY.md` 16카테고리.
- 방법: read-only grep + 코드 정독. 의료법 §56 / 시행령 §23 / 보건복지부 「의료광고심의 운영 매뉴얼」을 기준점으로 사용.
- 작성 원칙: "법 위반 확정" 단정 금지. **"위반 risk"** 표현 사용. 룰셋 직접 수정 제안 시 **법무 검토 필요** 명시.
- 본 산출은 코드 변경 0. 단일 파일.

> ⚠️ **법률 해석 주의**: 본 문서의 의료법 인용 및 해석은 read-only 코드 감사용 사실 정리. 실제 룰셋 추가/수정 시 보건복지부·대한의사(치과의사)협회 자율심의기준 최신본을 사내 법무가 재검토해야 함.

---

## 0. TL;DR — 가장 위험한 결론 5

1. **AI-002 / AI-003 (zero-width / homoglyph / 줄바꿈 분리 우회) — 베이스라인 미수정·회귀 상태.**
   `validateMedicalAd`(`public-app/lib/medicalAdValidation.ts:225`) 가 `text.indexOf(rule.keyword)` 단순 매칭만 수행. 정규화·sanitize 단계가 전혀 없음 → AI 가 의도하지 않더라도 사용자 수동 입력으로 우회 가능.
2. **CMP-D-001 (testimonial 우회) / CMP-D-002 (가격 시간·희소성 압박) — 미수정.**
   "이런 분들이 만족하셨어요", "선착순", "오늘만", "마감임박" 등 단어가 룰셋에 0건.
3. **카드뉴스 다운로드 hard block 부재.** 위반 배너만 표시(`CardNewsProRenderer.tsx:946`), 다운로드/PDF/ZIP/쇼츠 영상 변환 모두 violation 0 강제 없이 진행. 사용자가 위반 무시·게시 가능 → 법적 risk 직격탄.
4. **클라이언트-only 검증 다수 + DevTools 우회.** 카드뉴스 슬라이드의 의료법 검증은 100% 브라우저(`SlideEditor` / `CardNewsProRenderer` `useMemo`). 카드뉴스 본문 생성은 `/api/gemini` 통과인데 `applyContentFilters` 적용 없음 (`card_news/page.tsx:880` 의 filter 는 결과 표시 전 client-side). 영상 자막은 라우트에 검증이 있으나 응답에 위반을 **포함만** 하고 차단은 안 함.
5. **PII 외부 LLM 전송 전 마스킹 부재.** `clinical/page.tsx`/`generate/blog` 프롬프트에 환자 사례/병원담당자명/의사명이 그대로 Anthropic·Gemini 로 전송. PIPA 제17조 2항(개인정보 처리위탁) 적용 가능성 있음(법무 검토 필요).

---

## 1. False Negative 시나리오 (최우선)

각 시나리오: ① 입력 예시 ② 통과 여부 + 코드 분석 근거 ③ 의료법 위반 risk 등급(정성)

### [BL-B-FN-001] zero-width 삽입 (AI-003 회귀)
- **입력 예시**: `"최​고의 임플란트"`, `"1​등 치과"`, `"100​% 안전합니다"`
- **통과 여부**: **통과 (false negative)**.
  - 근거: `medicalAdValidation.ts:239` `sanitized.indexOf(rule.keyword)` — `'최고'` 키워드는 `'최​고'` 의 substring 이 아니므로 미매칭. zero-width 제거 단계 없음(`grep u200/uFEFF` → 0건).
  - `applyContentFilters` 도 동일 — 정규식이 `[가-힣]` 단위만 다루고 zero-width 보호 없음. 단, `filterMedicalLawViolations` 의 일부 패턴은 `\s?` 를 허용하지만 `​` 는 `\s` 에 포함되지 않음(JavaScript `\s` 는 `​` 를 매치하지 않음).
- **위반 risk 등급**: **High** — 의료법 §56 ②항 8호 (소비자 오인 가능 표현) 직접 우회.
- **베이스라인 비교**: AI-003 회귀(미수정).

### [BL-B-FN-002] 줄바꿈/공백 삽입 우회 (AI-003 회귀)
- **입력 예시**: `"최\n고"`, `"최 고"`, `"보\n장"`, `"100 %"`
- **통과 여부**: 부분 통과. `validateMedicalAd` 의 키워드는 모두 raw substring → `"최 고"` 면 `'최고'` 미매칭. **`100%` 는 `100\s?%` 정규식이 `medicalLawFilter` 에 있어 `applyContentFilters` 단계에서는 잡힘**(line 38). 하지만 `validateMedicalAd` 에선 `'100%'` literal 만 보유 → `"100 %"` 통과.
- **근거**: `lib/medicalAdValidation.ts:57-174` 모든 키워드는 plain literal. 공백·줄바꿈 정규화 없음.
- **위반 risk 등급**: **High** — 시행령 §23 ②2호(효과 보장) 우회.
- **베이스라인 비교**: AI-003 회귀.

### [BL-B-FN-003] 한자 / 다국어 표현
- **입력 예시**: `"最高의 임플란트"`, `"最高峰 진료"`, `"No.1 dental"`(통과되지만 베이스라인 룰에 있음 → OK), `"world best clinic"`, `"number one"`, `"perfect care"`, `"絶對 안전"`
- **통과 여부**:
  - `'最高'` (한자) — **통과 (false negative)**. 룰셋에 한자 0건. `'No.1'` 만 한 줄, `'넘버원'` 만 한국어. `'best'`/`'number one'`/`'perfect'`/`'world class'` 는 룰 0.
  - 즉 영문 SEO 키워드를 그대로 남기면 룰셋 통과.
- **근거**: `medicalAdValidation.ts:60-174` grep 결과 ASCII 키워드는 `'No.1'` 1건, 한자 0건.
- **위반 risk 등급**: **Medium~High** — 한국어 콘텐츠 내 다국어 표현은 일반적인 의료광고심의 부적합 사유. 영문 키워드는 SEO 의도로 자주 등장 → 실효적 우회 경로.
- **베이스라인 비교**: 신규(미보고).

### [BL-B-FN-004] 동의어 / 의역 (AI 자체 회피)
- **입력 예시**: `"보장" → "약속드립니다"`, `"100%" → "단 한 분도 빠짐없이"`, `"최고급" → "프리미엄"`, `"부작용 없는" → "이상반응 거의 없는"`, `"완치" → "재발 0"`
- **통과 여부**:
  - `'약속'` 은 룰셋에 있음(line 94, severity medium) — OK.
  - `'프리미엄'`, `'이상반응'`, `'재발 0'`, `'단 한 분도 빠짐없이'`, `'예외 없이'` — **통과 (false negative)**.
  - `'최고급'` — `medicalLawFilter.ts:76` 에 자동 치환 패턴 있어 LLM 출력 단계는 잡힘. 단, 사용자 수동 입력 검증(`validateMedicalAd`) 에는 키워드 없음 → 카드뉴스 SlideEditor 에선 통과.
- **근거**: 룰셋 표제어가 사전식 — 의역 표현 미커버.
- **위반 risk 등급**: **High** — 보건복지부 의료광고심의 가이드 제3장 4절(소비자 오인 가능 표현)의 핵심 회피 경로. 광고심의에서 "프리미엄/럭셔리/VIP" 도 최상급 의역으로 다툼이 잦음.
- **베이스라인 비교**: 부분 신규. CMP-001(testimonial 우회) 문제와 동형.

### [BL-B-FN-005] testimonial(환자 후기) 우회 표현 (CMP-D-001 회귀)
- **입력 예시**:
  - `"이런 분들이 만족하셨어요"`, `"내원 후 변화"`, `"방문하신 분들의 이야기"`, `"실제 사례"`, `"진료 사례 모음"`, `"Before & After"`, `"비교 사진"`, `"환자분의 변화"`
- **통과 여부**: **거의 모두 통과 (false negative)**. 룰셋에 있는 testimonial 키워드는 `'후기' / '체험담' / '환자 후기' / '치료 후기' / '솔직 후기' / '리얼 후기' / '수술 후기' / '생생 후기'` 8건뿐. 위 의역 8개 중 0건 매칭.
- **근거**: `medicalAdValidation.ts:155-162` 8건 사전. `slide.beforeLabel`/`slide.afterLabel`/`slide.beforeItems`/`slide.afterItems` 는 `validateSlideMedicalAd` 가 검사하지만 키워드가 없으니 검증 무력.
- **위반 risk 등급**: **High** — 의료법 시행령 §23 ②2호 (치료경험담 광고 금지) 직접 우회. 시행령상 "사진 비교/전후 비교" 도 `시행령 §23 ②2호 가목` 의 치료경험담 범주로 해석되는 사례 있음(보건복지부 행정해석).
- **베이스라인 비교**: CMP-D-001 미수정·회귀.

### [BL-B-FN-006] 가격 광고 — 시간/희소성 압박 (CMP-D-002 회귀)
- **입력 예시**:
  - `"오늘만 50만원"`, `"선착순 10명 한정"`, `"마감임박"`, `"한정수량"`, `"오픈 기념가"`, `"이번 주만"`, `"~까지만"`, `"남은 자리 3"`, `"원래가 → 특별가"`
- **통과 여부**:
  - `'특가'` (line 144) / `'할인'` (line 149) / `'프로모션'` (line 152) 만 잡힘.
  - 위 9개 중 8개 — **통과**.
- **근거**: `medicalAdValidation.ts:140-152` 12건 사전 — 시간/희소성 카테고리 0건. `medicalLawFilter.ts` 에서도 inducement 패턴은 `'예약하세요'` 등만, 희소성 없음.
- **위반 risk 등급**: **High** — 의료법 §27 ③ (환자 유인행위 금지) 및 §56 ②항 14호 (소비자를 현혹하는 광고) 해석상 risk. 보건복지부 행정처분 사례 다수.
- **베이스라인 비교**: CMP-D-002 미수정·회귀.

### [BL-B-FN-007] 자격 사칭/수상 의역 (CMP-003 확장)
- **입력 예시**: `"한국 1위 닥터"`, `"VVIP 진료"`, `"마스터 닥터"`, `"임플란트 박사"`, `"교과서를 쓴"`, `"슈퍼 닥터"`
- **통과 여부**: `'1위'` (line 76) 단일 매칭. 그 외 **통과**. `'명의'` (line 167) 외 의역 미커버.
- **근거**: `medicalAdValidation.ts:165-174` 미검증/무자격 카테고리 9건 — 의역 회피 가능.
- **위반 risk 등급**: **High** — 시행령 §23 ②1호 (의학적으로 인정되지 않은 기능 광고) / §23 ②9호 (전문의 자격 사칭) risk.
- **베이스라인 비교**: 베이스라인 D-Low [CMP-003] 명시 부족 부분과 동형 (회귀/확장).

### [BL-B-FN-008] 비교광고 의역
- **입력 예시**: `"대학병원 수준"`, `"종합병원급"`, `"강남 메이저급"`, `"○○대 교수 출신"`, `"상위 1%"`, `"국내 어디서도 보기 힘든"`
- **통과 여부**: 전부 **통과**. 룰셋의 비교 카테고리(`'타 병원' '다른 병원' '다른 치과' '타 치과' '일반 치과' '보다 우수' '보다 뛰어' '수술 없이' '발치 없이'`) 9건 — 의역 0개 커버.
- **근거**: `medicalAdValidation.ts:130-138`.
- **위반 risk 등급**: **Medium~High** — 의료법 §56 ②5호(비교광고 금지) risk.

### [BL-B-FN-009] 객체 배열 nested 필드 — `validateSlideMedicalAd` 누락
- **입력 예시**: `slide.priceItems[i].price` 에 `"오늘만 100만원 → 50만원"`, `slide.numberedItems[i].num` 에 `"No.1"`, `slide.dataPoints[i].value` 에 `"100%"` (단, value 필드는 `validateSlideMedicalAd` 에서 검사 안 함)
- **통과 여부**: **부분 통과 (false negative)**.
  - `validateSlideMedicalAd` (line 284-356) 가 검사하는 필드: 평탄 13개 + nested 텍스트/객체 배열. 그러나 `priceItems[i].price` (price 자체 숫자/문자열 가격) — 코드를 보면 `name` / `note` 만 검사하고 `price` 미검사 (line 350-353). `dataPoints[i].value` 도 미검사 (line 332-334 — `label` 만).
- **근거**: `medicalAdValidation.ts:332-353`.
- **위반 risk 등급**: **Medium** — 가격 표시 필드는 핵심 위반 자리(시행령 §23 ②13호 비급여 진료비 광고).

### [BL-B-FN-010] 검증 함수 자체 호출 안 되는 경로
- **카드뉴스 본문 생성 라우트**: `app/api/gemini/route.ts` (카드뉴스 prompt 호출용) — `applyContentFilters` 미호출. 검증은 페이지 컴포넌트 `card_news/page.tsx:880` 에서 client 측에서만.
- **DevTools 우회**: 클라이언트 측 `applyContentFilters` 호출은 전부 우회 가능. 서버 라우트가 violation count 응답하지 않으므로 클라이언트가 무시해도 콘텐츠 저장(`savePost`) 은 된다.
- **블로그 review 라우트 graceful degrade**: `route.ts:172-187` — JSON parse 실패 시 `verdict='pass'` 처리, 그러나 `applyContentFilters` 안전망은 LLM 호출 자체가 실패한 경우에만(line 144) 작동. **JSON parse 실패는 pass 처리되며 `revisedHtml=null` 로 통과** — 그 결과는 client 가 받지만 클라이언트는 `applyContentFilters` 를 별도 적용하지 않음(`blog/page.tsx:1422-1469` 는 review.revisedHtml 만 적용). 즉 LLM 응답이 fail-open 형태일 때 `parse_failed_passthrough` 라벨로 violation 검증 누락 가능.
- **위반 risk 등급**: **High** (운영상 가장 흔한 경로).

### [BL-B-FN-011] HTML 태그 placeholder 우회
- **입력**: `"<u>최고</u>"`, `"<a href=\"x\">최고</a>"`, `"최<span>고</span>"`
- **분석**: `transformTextOnly` (`medicalLawFilter.ts:144`) 가 `<...>` 매칭 후 텍스트만 변환. 그러나 `최<span>고</span>` 는 `<span>` 이 placeholder 가 되어 텍스트는 `최\x000\x00고\x001\x00` 형태가 되며, 정규식 `/최고/g` 가 매칭 안 됨 → **false negative**.
- **위반 risk 등급**: **Medium** — Gemini/Sonnet 출력에 의도 없이 발생할 수 있음. AI 가 의도적 회피 시 직접 위험.
- **베이스라인**: 신규 발견.

---

## 2. 의료법 §56 룰셋 커버리지 점검

### (a) 과장·허위 광고 (§56 ②8호 관련)
- 커버: `'기적' '마법' '경이로운' '드라마틱' '즉각적' '하루 만에' '한 번에' '단 한 번' '혁신적' '획기적'` (`medicalAdValidation.ts:98-111`).
- **누락 risk**: `'역대급'`, `'전설의'`, `'센세이션'`, `'역사를 바꾼'`, `'수퍼'/'슈퍼'`, `'끝판왕'`, `'갓-'` 같은 신조어. 사용자가 SNS 카드뉴스에서 채택할 가능성 높음.

### (b) 치료 효과 보장 (시행령 §23 ②2호)
- 커버: `'보장' '보증' '확실' '확실한 효과' '반드시' '100%' '완벽' '완치' '완전' '확실히 낫' '틀림없' '장담' '약속' '책임지' '근본적 해결'` (line 80-95).
- **누락 risk**: `'절대'` 단독 매칭 — `medicalAdValidation.ts` 룰에 **0건**. (`medicalLawRules.ts:14` "절대" 가 `FORBIDDEN_EXPRESSIONS.guarantee` 에 있고 `medicalLawFilter.ts:98` 의 `'무조건'` 자동 치환 — 그러나 **`validateMedicalAd` 룰셋엔 부재**.) `'평생'`, `'영구'`, `'영원'`, `'재발 없'`, `'재발률 0'`.

### (c) 비교 광고 (§56 ②5호)
- 커버: line 130-138 9건 — 위 BL-B-FN-008 참조.
- **누락 risk**: 의역 다수.

### (d) 환자 후기 부적절 인용 (시행령 §23 ②2호)
- 커버: line 155-162 8건.
- **누락 risk**: 위 BL-B-FN-005 참조 — 핵심 의역 8개 미커버.

### (e) 비급여 가격 광고 (§56 ②13호 / 시행규칙 §42)
- 커버: `'최저가' '최저 비용' '파격 할인' '특가' '무료 시술' '공짜' '0원' '덤' '할인' '이벤트 가격' '% 할인' '프로모션'` (line 141-152).
- **누락 risk**: BL-B-FN-006 (시간/희소성 8개), 비급여 진료비 미표시 자체는 본 검증기로 탐지 불가 (정규식의 본질적 한계 — 가격 표기 의무는 텍스트 부재 검증 필요).

### (f) 전문의 자격 사칭
- 커버: `'특효' '만병통치' '명의' '명의가' '전문의'(주의) '베스트 닥터' '수상' '선정' '인증'` 9건.
- **누락 risk**: BL-B-FN-007 의역 6개+.

### (g) 의료기관·의사 비교
- 동일 (c). 의역 미커버.

### (h) 신의료기술 평가 미통과 시술 광고
- **룰 자체 부재.** `'특효' '만병통치'` 만 언급. 한국보건의료연구원 신의료기술평가위원회의 미통과/평가 중인 시술명 사전이 없음. 룰셋 등록은 도메인 사전 필요 — **법무 + 의료자문 검토 필수**.

---

## 3. 검증 호출 경로 매핑 (단일 호출 vs 다단계, client vs server)

| 콘텐츠 타입 | 생성 라우트 (server) | 자동 치환 (server) | 수동 검증 (client) | 안전망 (review) | DevTools 우회 가능? |
|---|---|---|---|---|---|
| 블로그 본문 | `/api/generate/blog` | `filterMedicalLawViolations` | client `applyContentFilters` 추가 | `/api/generate/blog/review` Opus + safety net | **부분**. server 가 violations 검출만 응답, 차단은 client 책임. |
| 블로그 섹션 재생성 | `/api/generate/blog/section` | `applyContentFilters` (server) | 없음 | 없음 | 가능 — server 응답 이후 사용자 편집 시 검증 없음. |
| 블로그 review | `/api/generate/blog/review` | safety net (LLM 실패/parse 실패시) | 없음 | 자체 | parse 실패 시 `verdict='pass'` (line 173-178). |
| 보도자료 / 임상수기 / 유튜브 / refine | server 생성 → client `applyContentFilters` | client 측 | 없음 | 없음 | **가능**. Network tab 에서 client filter 우회 시 그대로 저장. |
| 카드뉴스 본문(텍스트) | `/api/gemini` 직호출 | **server 적용 없음** | client 페이지 `card_news/page.tsx:880` `applyContentFilters` | 없음 | **가능, 핵심 위험**. |
| 카드뉴스 슬라이드 편집 | (생성 후 사용자 편집) | 없음 | `validateSlideMedicalAd` (`SlideEditor.tsx:181`, `CardNewsProRenderer.tsx:892`) | 없음 — 배너만 표시 | 가능. UI 무시 시 다운로드 통과. |
| 카드뉴스 다운로드 (PNG/PDF/ZIP/Shorts) | `cardDownloadUtils` | 없음 | 없음 | **없음 — hard block 부재** | n/a (다운로드 자체에 검증 0). |
| 영상 자막 STT | `/api/video/generate-subtitles` | 응답에 violations 포함 (line 222-235) | `StepSubtitle.tsx:957` `validateMedicalAd` (toggle 가능 — `medicalCheckEnabled`) | 없음 | 가능 — toggle off + 자막 SRT 출력은 violation 없이 진행. |

### 누락·우회 핵심
- **클라이언트 토글 off 시 검증 우회**: `StepSubtitle.tsx:957-959` `medicalCheckRef.current ? validateMedicalAd(text) : []` — `medicalCheckEnabled=false` 면 무조건 `[]`. 사용자가 endpoint 응답을 신뢰해야 보장.
- **`validateMedicalAd` 가 hard-block 으로 작동하는 경로 0**. 모두 경고/배너/안내 수준.
- **블로그 review parse_failed_passthrough**: line 173-187. JSON parse 실패 + LLM 호출은 성공 → verdict='pass' 로 client 에 도달. client `blog/page.tsx:1422` 는 `revisedHtml` 없으면 원본 유지 → `applyContentFilters` 는 line 1206/1400 에서 본문 단계에 이미 적용되었으나 새 violation(특히 의역) 은 그대로.

---

## 4. PIPA / PII 관점

### 외부 LLM 전송 시 PII 마스킹 부재
- `app/api/gemini/route.ts`, `app/api/generate/blog/route.ts`, Anthropic SDK 호출 코드 — **사용자 입력에 환자명/의사명/병원담당자명 들어가도 마스킹 함수 호출 없음**. `grep maskPII / maskPatient / sanitizePromptInput` 결과 → `sanitizePromptInput` 은 인젝션 대응(`promptSanitize.ts`)이지 PII 마스킹 아님.
- 예: `clinical/page.tsx` 의 진료 사례 입력 → `/api/gemini` → Gemini 전송. 사용자가 환자 이름·생년월일·차트번호를 텍스트로 직접 입력하면 그대로 위탁 처리.

### `docs/PII_INVENTORY.md` 와의 대조 — 인벤토리 완전성
- 인벤토리 16카테고리 vs 실제 코드의 데이터 흐름:
  - **[BL-B-PII-001] 인벤토리 누락 후보 — 사용자 입력 prompt 자체가 PII 컨테이너**.
    인벤토리 14번 항목 "LLM 프롬프트 입력 (병원명·진료 사례 텍스트 등)" 으로 일부 다루지만 **카드뉴스 슬라이드 텍스트(slide.body 등)** 가 환자 식별 정보를 포함해 외부 전송될 수 있는 점은 별도 명시 부재. (인벤토리 14번이 generate/blog 만 예시.)
  - **[BL-B-PII-002] STT 응답 자막 텍스트의 유보**. `app/api/video/generate-subtitles/route.ts` 가 STT 결과 `transcript` 를 응답으로 반환하지만 인벤토리에는 video 9번 "DB 미보관" 으로 표기. 그러나 클라이언트가 받은 자막 텍스트가 SubtitleSegment 로 `generated_posts.content` 에 저장되는지 확인 필요(인벤토리 4번 generated_posts 의 content 컬럼 참조).
  - **[BL-B-PII-003] 진단 history (`diagnostic_history.url`)** — 외부 사이트 URL 이지만, 진단 분석 본문이 환자 후기·병원 holdings 페이지를 크롤링한 결과를 OpenAI/Claude 로 전송. 인벤토리 7번에 노출되어 있으나 외부 LLM 전송 사실은 14번에 부분만 명시.
  - **[BL-B-PII-004] hospital_images auto-tag** — 이미지 자동 태그 라우트(`app/api/hospital-images/auto-tag/route.ts`) 가 Gemini 전송. 인벤토리 8번이 PIPA·의료법 risk 명시했으나 LLM 위탁 처리 사실 자체는 14번 하단에 첨부됨. 식별 가능 환자 얼굴/차트의 자동 마스킹 여부는 코드상 부재.

### PIPA 적용 가능 risk
- 제17조 (제3자 제공·처리위탁) — 외부 LLM 전송은 **위탁(처리위탁)** 으로 분류 가능. 위탁 사실 동의/공지 부재 가능성.
- 제22조 (동의) — `auth/page.tsx` 에 동의 체크박스 없음(인벤토리 5번 명시).
- 제29조 (안전성 확보) — 평문 userId 로그(인벤토리 16번 OPS-007)와 본 발견은 별개 위험.
- **법무 검토 필수** — 위 사항은 코드 사실. 법령 적용은 법무 판단.

---

## 5. 의료법 외 한국 규제 적용 가능성

### 표시·광고의 공정화법
- §3 (거짓·과장 광고 금지) — 의료법 §56 와 부분 중첩. validateMedicalAd 룰셋이 §56 만 의식 → 표시법 §3 의 "사실의 누락(가격, 부작용, 자격)" 검증 없음.
- 룰셋 출처 주석에 "표시광고법" 1회 등장(line 59) 단편적.

### 의료기관 광고 사전심의 (의료법 §57)
- 일정 규모(병원·종합병원) 이상 또는 특정 매체(인터넷 신문, 일정 도달자 수 이상 SNS 등) 의 의료광고 사전심의 대상.
- 본 도구는 검증기에 사전심의 대상 판정 로직 없음. 다음 기능 부재:
  - 매체 선택(블로그 게재 매체 도달자 수) 기반 사전심의 의무 안내.
  - 사전심의 필수 매체 식별.
- **법무 검토 필수**.

### 옥외광고법
- 블로그·카드뉴스·SNS 영상은 통상 옥외광고법 적용 외 (digital signage 옥외 노출 시만 적용). 본 검증 범위 밖.

### PIPA (위 §4 참조)

---

## 6. 검증 룰셋 출처 / 추적성

- `medicalAdValidation.ts:55-174` — 카테고리별 주석에 "(시행령 제23조 제2호)" 등 일부 인용. 그러나 키워드 단위 출처 없음. **개별 키워드가 어느 행정해석/심의기준에서 왔는지 추적 불가.**
- `medicalLawFilter.ts:9-` — 출처 주석 0건. 변경 이유 코멘트만(`Day 5 오탐 축소` 등 내부 메타).
- `medicalLawRules.ts:1-49` — 5개 카테고리 사전. 출처 주석 없음.
- **법령 인용 단위 추적 불가** → 후속 룰셋 업데이트(보건복지부 가이드 개정 시) 시 변경 영향 평가 곤란.

---

## 7. 발견 — 정형 포맷

### [BL-B-001] zero-width / 줄바꿈 분리 우회 (AI-003 회귀)
- 카테고리: false_negative / 의료법 위반 risk
- 심각도: **Critical**
- 위치: `public-app/lib/medicalAdValidation.ts:225-261`, `packages/blog-core/src/medicalLawFilter.ts:9-123`
- 현상: `text.indexOf(rule.keyword)` 가 정규화 없이 raw substring 매칭. zero-width(U+200B/200C/200D/FEFF), `\n`, NBSP 분리 시 false negative.
- 영향: 사용자가 `'최​고'`, `'1​등'`, `'100​%'` 등으로 high-severity 키워드 우회 가능. 의료법 §56 ②8호 우회 risk.
- 재현: BL-B-FN-001/FN-002 입력 예시.
- 수정 제안: 매칭 전 `text.replace(/[​-‏﻿ ⁠]/g, '')` + 공백/탭/줄바꿈 압축 후 매칭. **법무 검토 불요(기술 수정).**
- 베이스라인 비교: `docs/audit/_findings_D_biz_ai.md:61` AI-003 미수정·회귀.

### [BL-B-002] 한자/다국어 키워드 부재
- 카테고리: 룰셋 커버리지
- 심각도: **High**
- 위치: `public-app/lib/medicalAdValidation.ts:60-174`
- 현상: `'最高'`, `'best'`, `'number one'`, `'perfect'`, `'絶對'` 등 비한글 표현 0건.
- 영향: 다국어 SEO 키워드를 통한 룰셋 우회 risk.
- 재현: BL-B-FN-003.
- 수정 제안: 한자/영문 동의어 사전 추가. **법무 검토 필요** (어느 표현까지 §56 위반으로 볼지 자체가 해석).
- 베이스라인 비교: 신규.

### [BL-B-003] 동의어/의역 / AI 회피
- 카테고리: false_negative / 룰셋 커버리지
- 심각도: **High**
- 위치: `public-app/lib/medicalAdValidation.ts:55-174`, `packages/blog-core/src/medicalLawFilter.ts:9-123`
- 현상: `'프리미엄' '럭셔리' 'VIP' '단 한 분도' '예외 없이' '재발 0' '이상반응 거의 없는'` 등 의역 표현 0건.
- 영향: AI 가 룰셋을 학습해 의역 출력 시 모두 통과. 보건복지부 의료광고심의 기준상 위반 사유 다수.
- 재현: BL-B-FN-004.
- 수정 제안: 의역 사전 추가 + LLM 안전망(블로그 review 의 verdict 기반)에 "의역 회피 시 minor_fix 강제" 룰. **법무 검토 필요.**
- 베이스라인 비교: 부분 신규(CMP-D-001 testimonial 카테고리와 동형).

### [BL-B-004] testimonial 우회 표현 부재 (CMP-D-001 회귀)
- 카테고리: 룰셋 커버리지 / 의료법 위반 risk
- 심각도: **High**
- 위치: `public-app/lib/medicalAdValidation.ts:154-162`
- 현상: `'이런 분들이' '내원 후 변화' '실제 사례' 'Before & After' '비교 사진' '환자분의 변화'` 미커버.
- 영향: 시행령 §23 ②2호 (치료경험담 광고) 우회.
- 재현: BL-B-FN-005.
- 수정 제안: testimonial 카테고리 사전 확장. **법무 검토 필요** (Before/After 가 자체 광고 가이드상 어디까지 위반 범주인지 해석 필요).
- 베이스라인 비교: CMP-D-001 미수정.

### [BL-B-005] 가격 — 시간/희소성 압박 표현 부재 (CMP-D-002 회귀)
- 카테고리: 룰셋 커버리지 / 환자 유인 risk
- 심각도: **High**
- 위치: `public-app/lib/medicalAdValidation.ts:140-152`
- 현상: `'오늘만' '선착순' '마감임박' '한정수량' '오픈 기념가' '~까지만' '남은 자리'` 0건.
- 영향: 의료법 §27 ③(환자 유인행위) / §56 ②14호 risk.
- 재현: BL-B-FN-006.
- 수정 제안: scarcity/urgency 카테고리 사전 추가. **법무 검토 필요**.
- 베이스라인 비교: CMP-D-002 미수정.

### [BL-B-006] 자격 사칭/수상 의역 부재
- 카테고리: 룰셋 커버리지
- 심각도: **High**
- 위치: `public-app/lib/medicalAdValidation.ts:165-174`
- 현상: `'한국 1위' 'VVIP' '마스터 닥터' '○○대 출신' '교과서를 쓴' '슈퍼 닥터' '상위 1%'` 미커버.
- 영향: 시행령 §23 ②9호 (전문의 자격 사칭) risk.
- 재현: BL-B-FN-007.
- 수정 제안: 자격 사칭 의역 사전 확장. **법무 검토 필요**.
- 베이스라인 비교: D-Low [CMP-003] 확장.

### [BL-B-007] 비교광고 의역 부재
- 카테고리: 룰셋 커버리지
- 심각도: **Medium~High**
- 위치: `public-app/lib/medicalAdValidation.ts:130-138`
- 현상: `'대학병원 수준' '종합병원급' '강남 메이저급' '상위 1%'` 미커버.
- 영향: §56 ②5호(비교광고) risk.
- 재현: BL-B-FN-008.
- 수정 제안: 비교 의역 사전 확장. **법무 검토 필요**.
- 베이스라인 비교: 신규.

### [BL-B-008] `validateSlideMedicalAd` 객체 배열 일부 필드 미검증
- 카테고리: false_negative / 검증 누락
- 심각도: **Medium**
- 위치: `public-app/lib/medicalAdValidation.ts:332-353`
- 현상: `dataPoints[i].value`, `priceItems[i].price`, `priceItems[i].oldPrice` (있다면), `numberedItems[i].badge` 등 미검사. 코드는 `label` / `name` / `note` / `num` / `title` / `desc` 만.
- 영향: 가격 슬라이드의 핵심 필드(price 자체) 미검증 → BL-B-FN-009.
- 재현: 카드뉴스 가격 슬라이드의 `priceItems[0].price = "오늘만 100만원"`.
- 수정 제안: `SlideData` 타입의 모든 string/number 필드를 enumerate 하는 helper 도입.
- 베이스라인 비교: 신규.

### [BL-B-009] 카드뉴스 다운로드 hard block 부재
- 카테고리: 호출 경로 / 검증 무력화
- 심각도: **Critical**
- 위치: `public-app/components/CardNewsProRenderer.tsx:725-755`, `:874`
- 현상: `totalViolations.high > 0` 이어도 `downloadCard / downloadAll / downloadAllPdf / downloadShorts` 가 모두 진행. UI 배너 표시만(line 946-963).
- 영향: 사용자가 의료법 위반 콘텐츠를 PNG/PDF/MP4 로 export 후 SNS 게시 가능. 법적 risk 직격탄.
- 재현: 위반 키워드 슬라이드 → 다운로드 버튼.
- 수정 제안: `totalViolations.high > 0` 일 때 download 버튼 disabled + 강제 모달. **UX 정책 결정 필요(완전 차단 vs warn-and-proceed) → 법무 검토 필요.**
- 베이스라인 비교: 신규(베이스라인은 검증 누락만 다룸).

### [BL-B-010] 카드뉴스 본문 server-side 자동 치환 부재
- 카테고리: 호출 경로 / DevTools 우회
- 심각도: **High**
- 위치: `public-app/app/api/gemini/route.ts` (카드뉴스 prompt 처리), `public-app/app/(dashboard)/card_news/page.tsx:880`
- 현상: 카드뉴스 본문 생성은 `/api/gemini` server route 사용. server 응답에 `applyContentFilters` 미적용. client `card_news/page.tsx:880` 만 적용.
- 영향: client 필터 우회 시 raw 문자열이 그대로 SlideEditor 로 들어감. (단, client validateSlideMedicalAd 는 별개로 동작)
- 재현: 네트워크 차단 + DevTools React state 직접 수정.
- 수정 제안: server route 에서 `applyContentFilters` 적용. **법무 검토 불요.**
- 베이스라인 비교: BIZ-003 동형(다른 우려: 크레딧). 새 관점.

### [BL-B-011] 영상 자막 client-side 토글 off 시 미검증
- 카테고리: 호출 경로
- 심각도: **Medium**
- 위치: `public-app/components/video-edit/StepSubtitle.tsx:944, 957-959`
- 현상: `medicalCheckEnabled` 토글 off 시 `runValidate` 가 무조건 `[]`. 단, server `/api/video/generate-subtitles/route.ts:223` 는 항상 `validateMedicalAd` 호출 후 응답에 포함 → 응답을 client 가 사용하면 OK. **그러나 사용자가 자막 split/merge/edit 시 client 재검증은 토글 off 면 0**.
- 영향: 사용자가 토글 끄고 위반 자막 추가/편집 시 검증 누락.
- 재현: 토글 off → "최고" 자막 추가 → SRT export.
- 수정 제안: 검증 자체는 항상 수행, 표시만 토글로 제어.
- 베이스라인 비교: 신규.

### [BL-B-012] 블로그 review parse_failed_passthrough fail-open
- 카테고리: 호출 경로
- 심각도: **High**
- 위치: `public-app/app/api/generate/blog/review/route.ts:173-187`
- 현상: LLM 응답 JSON parse 실패 시 `verdict='pass'` 처리. `applyContentFilters` 안전망은 LLM 호출 자체가 실패한 경로(line 137-163)만 작동. parse 실패 fall-through 는 안전망 미가동.
- 영향: review 단계가 의료광고법 안전망인데, parse 실패 시 무력화.
- 재현: review 응답이 비-JSON 일 때(LLM 출력 변동).
- 수정 제안: parse 실패 시에도 `applyContentFilters(draftHtml)` 안전망 가동, replacedCount > 0 면 minor_fix 승격.
- 베이스라인 비교: 신규(베이스라인 D 의 LLM call_failed fallback 만 있음).

### [BL-B-013] HTML 태그 placeholder 가 키워드를 가로지르는 false negative
- 카테고리: false_negative
- 심각도: **Medium**
- 위치: `packages/blog-core/src/medicalLawFilter.ts:144-156`
- 현상: `transformTextOnly` 가 `<...>` 를 `\x00<idx>\x00` 로 치환 후 텍스트만 변환. `최<span>고</span>` 같이 키워드를 끊는 inline 태그 사이엔 패턴 미매칭.
- 영향: AI 출력에 의도치 않게 inline 태그가 끼어들면 우회.
- 재현: `<p>최<span style="color:red">고</span>의 임플란트</p>` 입력.
- 수정 제안: 텍스트 노드 단위 매칭 전 placeholder 제거 + 정규화 후 매칭. (단순 strip 시 위치 매핑 손실 risk — 신중 설계 필요.)
- 베이스라인 비교: 신규.

### [BL-B-014] 외부 LLM 전송 전 PII 마스킹 부재
- 카테고리: PIPA / PII
- 심각도: **High** (법적 노출 가능성)
- 위치: `public-app/app/api/gemini/route.ts`, `public-app/app/api/generate/blog/route.ts:247`, Anthropic SDK 호출 다수, `app/api/hospital-images/auto-tag/route.ts:180`, `app/api/video/generate-subtitles/route.ts:131-175`(Google STT)
- 현상: 환자명/의사명/병원담당자명/주소가 사용자 입력에 포함되어도 마스킹·PII 분리 없음. `sanitizePromptInput` 은 인젝션 방어이지 PII 마스킹 아님.
- 영향: PIPA §17 위탁 처리 동의·공지 미흡 가능. 환자 식별 정보가 외부 LLM 학습 데이터로 흐를 risk(공식 옵트아웃 정책 별도 확인 필요).
- 수정 제안: PII 검출 + 마스킹 함수 도입(이름/생년월일/차트번호 패턴). **법무 검토 필수**.
- 베이스라인 비교: PII_INVENTORY.md 14번 항목 확장. 신규.

### [BL-B-015] 룰셋 출처(법령 조문) 추적성 부재
- 카테고리: 거버넌스
- 심각도: **Low~Medium**
- 위치: 모든 룰셋 파일.
- 현상: 키워드 단위로 출처 인용 없음. 카테고리 헤더에 § 일부만.
- 영향: 행정해석 변경 시 영향 평가 곤란. 대외 컴플라이언스 감사 응답 곤란.
- 수정 제안: 키워드별 `source` 메타 필드(예: `'시행령 §23 ②2호'`, `'심의기준 §3장 4절'`) 추가. **법무 검토 필요(인용 정확성).**
- 베이스라인 비교: 신규.

### [BL-B-016] 신의료기술 평가 미통과 시술 사전 부재
- 카테고리: 룰셋 커버리지
- 심각도: **High**
- 위치: `public-app/lib/medicalAdValidation.ts:165-174`
- 현상: 한국보건의료연구원 신의료기술평가위원회 미통과 시술명 사전 0건. `'특효' '만병통치'` 일반어만.
- 영향: 미통과 시술의 광고는 의료법 §56 ②1호(평가 미통과 신의료기술 광고) 위반 risk. 룰셋이 비어 있어 자동 감지 불가.
- 수정 제안: 외부 데이터(의료기술평가원 공식 목록) 동기화 → 시술명 사전 자동 갱신. **법무 + 의료자문 검토 필수**.
- 베이스라인 비교: 신규.

### [BL-B-017] 사전심의 대상 식별 부재 (의료법 §57)
- 카테고리: 거버넌스
- 심각도: **Medium~High**
- 위치: 전체 콘텐츠 파이프라인.
- 현상: 매체 도달자 수·매체 종류 기반 사전심의 의무 판정 없음.
- 영향: 사용자가 의료광고 사전심의 의무를 모른 채 게시 가능 → 의료법 §57 위반 risk.
- 수정 제안: UI 안내 + 사전심의 의무 체크리스트(매체별). **법무 검토 필수**.
- 베이스라인 비교: 신규.

---

## 8. 의료법 §56 룰셋 커버리지 등급

**전체 등급: C (보통, 의역·다국어·zero-width 회피에 광범위하게 false negative)**

| 항목 | 등급 | 사유 |
|---|---|---|
| (a) 과장·허위 | **B** | 핵심 단어는 다수. 신조어 일부 누락. |
| (b) 효과 보장/단정 | **B** | 핵심 사전 양호하나 `'절대'` 누락 + zero-width 우회 노출. |
| (c) 비교광고 | **C** | 9건 사전. 의역 거의 미커버. |
| (d) 환자 후기 | **C** | 8건 사전. Before/After·"이런 분들이" 류 미커버 (CMP-D-001 회귀). |
| (e) 가격 광고 | **D** | 시간/희소성 0건 (CMP-D-002 회귀). 시술명별 비급여 표시 의무 검증 부재. |
| (f) 자격 사칭 | **C** | 9건. 의역(VVIP/마스터 등) 미커버. |
| (g) 의료기관 비교 | **C** | (c) 와 동일. |
| (h) 신의료기술 미통과 | **D** | 사전 자체 부재. 일반어만. |
| 호출 경로 안전성 | **D** | hard-block 0, server-side 검증 부족, DevTools 우회 가능, parse_failed_passthrough fail-open. |
| 입력 정규화 | **F** | zero-width / 줄바꿈 / NBSP / homoglyph 모두 미정규화 (AI-003 회귀). |

---

## 9. 카테고리별 발견 수 표

| 카테고리 | Critical | High | Medium | Low |
|---|---|---|---|---|
| false_negative (룰셋 우회) | 1 | 4 | 2 | 0 |
| 룰셋 커버리지 | 0 | 5 | 1 | 1 |
| 호출 경로 / 검증 무력화 | 1 | 2 | 1 | 0 |
| PIPA / PII | 0 | 1 | 0 | 0 |
| 거버넌스 | 0 | 1 | 0 | 1 |
| **합계 (BL-B-001..017)** | **2** | **13** | **4** | **2** |

---

## 10. 베이스라인 회귀/회귀 의심 항목

| 베이스라인 ID | 본 감사 ID | 상태 |
|---|---|---|
| AI-002 (zero-width / homoglyph in promptSanitize) | (검증기 외 — promptSanitize.ts 도 미수정 확인) | 미수정·회귀 |
| AI-003 (medicalAdValidation zero-width / 줄바꿈) | BL-B-001 | 미수정·회귀 |
| CMP-D-001 (testimonial 우회 표현 부족) | BL-B-004 | 미수정·회귀 |
| CMP-D-002 (가격 시간/희소성) | BL-B-005 | 미수정·회귀 |
| CMP-003 (자격 사칭 의역) | BL-B-006 | 부분 확장 |

---

## 11. 법무 검토 필수 항목 (룰셋·정책 수정 전 사내 법무 + 의료광고 자율심의 자문)

| 항목 | 근거 |
|---|---|
| BL-B-002 한자/다국어 키워드 추가 | 어느 표현까지 §56 위반으로 분류할지 — 표현 자체 해석 |
| BL-B-003 의역 사전 확장 | "프리미엄/럭셔리/VIP" 자체가 위반인지 vs 맥락 의존 |
| BL-B-004 testimonial Before/After 처리 | 시행령 §23 ②2호 가목 해석 — 사진 비교까지 차단 범위 |
| BL-B-005 시간/희소성 확장 | §27 ③ 환자 유인 해석 |
| BL-B-006 자격 의역 | §23 ②9호 사칭 범위 |
| BL-B-009 카드뉴스 hard block 정책 | 완전 차단 vs warn-and-proceed UX 정책 |
| BL-B-014 PII 마스킹 도입 | PIPA §17/§22 위탁/동의 절차 |
| BL-B-015 룰셋 출처 인용 정확성 | 행정해석 인용 표기 |
| BL-B-016 신의료기술 평가 미통과 시술 사전 | 한국보건의료연구원 공식 자료 동기화 |
| BL-B-017 사전심의 대상 안내 | 의료법 §57 — 매체별 적용 요건 |

---

## 12. 산출 메타

- 본 산출은 read-only. 코드/룰셋/룰셋 정의 파일 수정 0.
- 작성일: 2026-05-06.
- 베이스라인 참조: `docs/audit/_findings_D_biz_ai.md` (AI-002 / AI-003 / CMP-001 / CMP-002 / CMP-003), `docs/AUDIT_REPORT.md` (CAT-AI-002 / CAT-AI-003 / CMP-D-001 / CMP-D-002), `docs/PII_INVENTORY.md` 16카테고리.
- 코드 인용 라인은 `git HEAD` 기준 (감사 시점 main HEAD `3666d74`).
