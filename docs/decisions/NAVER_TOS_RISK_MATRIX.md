# 네이버 약관 risk 매트릭스 (법무 검토용)

**상태**: 변호사 검토 대기
**작성일**: 2026-05-06
**작성자**: Agent ADR-3 (read-only audit)
**관련 감사 ID**: BL-C-T01 ~ T07
**대상 HEAD**: `fe9725e` (main)

---

## 0. 본 문서의 목적

- 변호사 자문을 받기 위한 **사실 자료**(코드 위치, 동작, 비즈니스 의존도)를
  단일 문서로 정리.
- **AI 는 권고 옵션을 제시하지 않는다.** 한국 약관·자동화 적법성 판단은
  법무 + 사업의 책임 영역이며, 본 감사관(AI)이 결정안을 만드는 것은 부적절.
- 본 문서는 그대로 PDF 로 변환해 변호사에게 전달하는 것을 전제로 한다.
- 본 문서에서의 "약관 risk"·"조항 X 와 충돌 가능성" 표현은 **risk surface 환기**
  목적이며, 약관 위반 단정이 아니다.

### 자료 출처

- `docs/audits/blog/_findings_BL-C.md` (BL-C 감사 보고서, 2026-04 작성)
- `crawler-server/**` (Express 4 + puppeteer-extra, Railway 배포)
- `winai-blog-publisher/**` (Express 4 + Playwright, 사용자 머신
  `localhost:17580`)
- 클라이언트 호출부: `next-app/`, `public-app/`, `packages/blog-core/`

### 인용 가능 / 인용 불가 표기 약속

- **인용 가능**: 코드 라인 (file:line) — 모두 본 worktree 에서 직접 확인됨.
- **인용 불가 / 변호사 확인 필요**: 네이버 이용약관·운영정책 본문, 정보통신망법
  특정 조항 해석, 외부 판례. AI 가 한국 약관 본문을 정확히 인용하기 어렵고
  최신성·정확성 보증이 불가하므로 본 문서에서는 **조항 본문을 인용하지 않는다**.
  변호사가 직접 약관 본문을 확인하고 판단할 입력 자료만 제공한다.

---

## 1. 약관 risk 항목 (BL-C T01~T07)

각 항목은 (a) 코드 위치, (b) 행위 설명, (c) 관련 약관 영역 (조항 본문 인용은
변호사 검토에 위임), (d) 비즈니스 의존도 형식으로 정리한다.

### T01 — Stealth 플러그인 + AutomationControlled 우회

- **코드 위치**:
  - `crawler-server/src/services/crawler.js:1-5` — `puppeteer-extra` +
    `puppeteer-extra-plugin-stealth` 적용.
  - `crawler-server/src/services/crawler.js:113` —
    `--disable-blink-features=AutomationControlled` Chromium 인자.
- **행위 설명**:
  - Headless 브라우저가 일반 브라우저처럼 보이도록 navigator.webdriver,
    window.chrome, plugins 배열, languages, permissions 등 다수의 자동화 식별
    지표를 패치하는 stealth plugin 을 적용.
  - 본 코드 주석에 "headless 브라우저 탐지 우회"가 직접 명시되어 있음
    (`crawler.js:4`).
- **관련 약관 영역** (변호사 확인 대상):
  - 네이버 이용약관 / 운영정책의 자동화 도구·로봇 행위 제한 조항.
  - 정보통신망법상 정보통신서비스 제공자의 보호조치 우회 관련 해석.
- **외부 사례**: AI 가 정확히 인용 가능한 공개 판례·언론보도를 찾지 못함.
  변호사 확인 필요.
- **비즈니스 의존도**: 검색·블로그·말투 학습용 크롤링의 **현재 모든** 기능이
  본 stealth 적용 브라우저로 동작. (대안: 공식 검색 API · 공식 블로그 API
  존재 여부는 §2 참고.)

### T02 — 네이버 ID/PW 자동 로그인 + 캡챠 시 사용자 개입 안내

- **코드 위치**:
  - `winai-blog-publisher/src/naver/login.ts:107-162` — `naverLogin()`.
  - 자동 입력 위치: `login.ts:117-120` (ID), `login.ts:125-128` (PW).
  - 캡챠/2FA 분기: `login.ts:142-152`.
- **행위 설명**:
  - 사용자가 winai-blog-publisher 데스크톱 앱에 자신의 네이버 ID/PW 를
    저장 (`utils/crypto.ts` 가 AES-256-GCM 으로 disk 보관, `~/.winai-publisher/encryption.key`
    mode 0600).
  - 발행 시 Playwright 가 `https://nid.naver.com/nidlogin.login` 에 자동
    네비게이트 후 ID/PW 입력란에 값을 채우고 로그인 버튼 클릭.
  - 캡챠/2FA 가 노출되면 "직접 입력해주세요" 안내 후 사용자 입력 대기
    (최대 120초). 캡챠 자체를 우회하는 코드는 없음.
  - 로그인 성공 시 `storageState` 저장 → 이후 발행 시 재로그인 최소화.
- **관련 약관 영역** (변호사 확인 대상):
  - 네이버 이용약관·블로그 약관의 계정·비밀번호 제3자 도구 위탁 / 자동
    로그인 도구 사용 관련 조항.
  - 캡챠가 자동화 차단 의도임을 전제로, 캡챠 후 자동 발행을 이어가는 흐름이
    "자동화 제한 우회"에 해당하는지 여부.
- **외부 사례**: 변호사 확인 필요.
- **비즈니스 의존도**:
  - winai-blog-publisher 발행 기능 **전체**가 본 자동 로그인에 의존.
  - 사용자(병원 회원)가 winai 대시보드에서 "발행" 버튼을 누르면 본 흐름이
    실행됨 (`winai-blog-publisher/src/api/server.ts:106-135` `/publish`
    라우트).

### T03 — 위장 User-Agent (실제 식별자 미사용)

- **코드 위치**:
  - `crawler-server/src/services/crawler.js:136-138, 209-211, 260-264, 410, 527`
  - `public-app/lib/diagnostic/crawler.ts:14-16`
- **행위 설명**:
  - `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
    Chrome/120.0.0.0 Safari/537.36` (또는 124.0.0.0) 형태로 일반 Chrome 위장.
  - `WinaidCrawler/1.0` 같은 식별자는 사용되지 않음. 진단 크롤러 측 주석에
    "Cloudflare WAF 회피 목적" 으로 명시 (`diagnostic/crawler.ts:14`).
- **관련 약관 영역** (변호사 확인 대상):
  - 네이버를 포함한 대상 사이트 이용약관의 robots.txt·봇 식별 의무 / 우회
    금지 조항.
  - bot 식별자 미사용이 일반적인 관행과 어떻게 평가되는지 (광범위 패턴이라
    단정 어려움).
- **외부 사례**: 변호사 확인 필요.
- **비즈니스 의존도**:
  - crawler-server 모든 puppeteer 페이지 — 검색·블로그 본문·hospital blog.
  - public-app 진단(diagnostic) 크롤러 — 의료기관 웹사이트 SEO·AEO 진단
    기능 (`/api/diagnostic`, `/api/diagnostic/competitor-gap`,
    `/api/diagnostic/stream`).

### T04 — robots.txt 미준수 (crawler-server)

- **코드 위치**:
  - `crawler-server/src/services/crawler.js` 전체 — `crawlNaverBlogs`,
    `crawlBlogContent`, `crawlHospitalBlogPosts`. robots.txt fetch / 파싱 /
    Disallow 매치 / Crawl-delay 존중 코드 0건.
  - 비교: `public-app/lib/diagnostic/crawler.ts` 는 `robotsSitemap.ts` 로
    robots.txt 를 **읽기는** 함 — 단, 진단 목적 (Disallow 우회 여부는 별도
    확인 필요).
- **행위 설명**:
  - `https://blog.naver.com/PostView.naver?blogId=...&logNo=...` 같은 URL 을
    robots.txt 확인 없이 직접 puppeteer 로 page.goto.
  - Crawl-Delay 존중 없음. 배치 간 300ms sleep 만 있음 (`crawler.js`
    인근 코드).
- **관련 약관 영역** (변호사 확인 대상):
  - 네이버 운영정책 / 이용약관에서 robots.txt / 자동 수집 차단 의사를
    명시한 부분이 있는지.
  - robots.txt 미준수 자체에 대한 한국 법(정보통신망법, 부정경쟁방지법 등)
    의 해석.
- **외부 사례**: 한국에서 robots.txt 미준수만으로 형사·민사 책임이 인정된
  공개 사례를 AI 가 정확히 확인하지 못함 — 변호사 확인 필요.
- **비즈니스 의존도**:
  - T03 과 동일 (모든 crawler-server 라우트).

### T05 — 자동 본문 입력 + 자동 등록 보조 (블로그 발행)

- **코드 위치**:
  - `winai-blog-publisher/src/naver/blogEditor.ts:108-134` — 본문 자동 입력
    (`document.execCommand('insertHTML', false, html)`).
  - `blogEditor.ts:136-149` — 태그 자동 입력.
  - 사용자가 마지막 "발행" 버튼은 직접 클릭하는 흐름 (코드 주석 기준
    `100% 자동 발행 아님`). 그러나 제목/본문/태그까지 자동 입력 + storageState
    재사용으로 로그인 단계도 1회 이후 자동.
- **행위 설명**:
  - 네이버 블로그 에디터 페이지(`https://blog.naver.com/${blogId}/postwrite`)에
    Playwright 로 자동 네비게이트 후 sanitize 된 HTML 을 본문에 주입, 태그를
    한 번에 입력.
  - 사용자가 이미지를 추가하고 발행 버튼을 클릭해야 실제 게시되는 구조.
- **관련 약관 영역** (변호사 확인 대상):
  - 네이버 블로그 약관의 자동 등록 도구 / 매크로 / 입력 보조도구 사용 조항.
  - "100% 자동 발행이 아님(사용자 클릭 필요)"이 약관 평가에 영향을 주는지.
  - 정보통신망법상 사이트 운영자 의도 우회 관련 해석.
- **외부 사례**: 변호사 확인 필요.
- **비즈니스 의존도**:
  - winai-blog-publisher 의 핵심 가치 제안. 본 흐름이 빠지면 사용자는 winai
    가 생성한 콘텐츠를 수동으로 복사·붙여넣기 해야 함.

### T06 — `search.naver.com` 검색 결과 자동 수집 (타인 작성 콘텐츠)

- **코드 위치**:
  - `crawler-server/src/services/crawler.js:127-195` — `crawlNaverBlogs(query, maxResults)`.
  - URL: `https://search.naver.com/search.naver?where=blog&query=...&start=...&nso=so:sim,p:from...to...`
  - 1~10 페이지 순회. 셀렉터: `.blog_content_area`, `.detail_box`, `.total_wrap`.
- **행위 설명**:
  - 사용자(병원 회원)가 winai 대시보드에서 키워드를 입력하면, 네이버 블로그
    검색 결과를 1~10 페이지까지 puppeteer 로 자동 순회 + 제목/링크/요약/
    블로거명을 추출.
  - 결과는 LLM 에 전달되어 "말투 학습"·콘텐츠 reference 로 사용
    (`packages/blog-core/src/styleService.ts:517+`).
- **관련 약관 영역** (변호사 확인 대상):
  - 네이버 검색 결과 페이지 자동 수집 / 데이터베이스권 / 저작권법 측면.
  - 수집한 데이터를 LLM 학습 보조 입력으로 사용하는 행위에 대한 평가.
  - 본 항목은 사용자 자신의 블로그가 아니라 **타인 작성 블로그 검색 결과**
    수집이라 T05 와 구분된다.
- **외부 사례**: 변호사 확인 필요. (한국 데이터베이스권·저작권 판례 다수
  존재하나 AI 가 정확 인용 어려움.)
- **비즈니스 의존도**:
  - 말투 학습(`WritingStyleLearner`) — 본 흐름은 사용자가 "잘 쓴 블로그
    예시" 를 검색·선정 시 결과 후보를 보여주기 위해 사용. 빠질 경우
    사용자가 URL 을 직접 붙여넣어야 함 (T06 가 빠져도 T01 (단일 블로그
    크롤링) 만 살아 있으면 부분 동작).

### T07 — 자동 입력 감지 우회 (DOM `evaluate` 직접 값 설정)

- **코드 위치**:
  - `winai-blog-publisher/src/naver/login.ts:117-120` (ID),
    `login.ts:125-128` (PW).
  - 코드 주석에 "evaluate로 직접 값 설정 (자동입력 감지 우회)" 명시
    (`login.ts:114`).
- **행위 설명**:
  - Playwright 의 일반 `page.fill` / `page.type` 이 아니라 `page.evaluate`
    안에서 `document.querySelector('#id').value = id` 로 값 할당 후
    `dispatchEvent(new Event('input', { bubbles: true }))` 으로 input 이벤트
    수동 발생.
  - 이는 페이지 측 자동화 탐지(타이핑 이벤트 패턴 분석)를 우회하는 의도가
    명시된 코드.
- **관련 약관 영역** (변호사 확인 대상):
  - T01 / T02 와 결합 시 "자동화 탐지 우회 의도가 명시된 코드"로 평가될
    수 있는지.
- **외부 사례**: 변호사 확인 필요.
- **비즈니스 의존도**:
  - T02 와 동일. 본 패턴이 빠지면 자동 로그인 자체가 capcha/탐지 노출 빈도가
    높아져 발행 흐름의 신뢰성이 저하될 가능성 (정량 데이터 없음 — 측정 필요).

---

## 2. 비즈니스 영향 매트릭스

각 항목이 코드 레벨에서 **제거**될 경우, 어떤 사용자 흐름이 영향을 받는지
정리. 사용자 비율은 측정 데이터가 본 worktree 에 없으면 "측정 필요" 명시.

| 항목 | 영향받는 사용자 흐름 | 영향 사용자 비율 | 대체 가능성 (네이버 공식 API 등) |
|---|---|---|---|
| T01 (stealth) | • 검색 결과 수집(`/api/naver/crawl-search`)<br>• 단일 블로그 본문 크롤링(`/api/naver/crawl-content`)<br>• 병원 블로그 일괄 크롤링(`/api/naver/crawl-hospital-blog`)<br>→ 말투 학습, 보도자료 생성 시 reference 가져오기 | 측정 필요 (대시보드 사용자 중 말투 학습/reference 사용 비율 미상) | 네이버 공식 검색 API (developers.naver.com 의 검색 API) 존재 — 다만 본 코드 베이스가 사용 중인지 별도 확인 필요. 본 worktree 에서 공식 API 호출 코드 0건. |
| T02 (자동 로그인) | • winai-blog-publisher 발행 흐름 전체 — 데스크톱 앱 설치 사용자가 winai.kr 대시보드에서 "발행" 누름 → 로컬 17580 으로 fetch → 자동 로그인 + 자동 입력 | 측정 필요 (winai-blog-publisher 설치 사용자 수 미상) | 네이버 블로그 공식 글쓰기 API 는 일반 사용자에게 공개되어 있지 않음 (변호사·기획 확인 필요). 대안: 사용자가 수동 로그인 후 OAuth/세션을 받는 형태 — 그러나 본 자료는 권고하지 않음. |
| T03 (위장 UA) | • crawler-server 모든 라우트<br>• public-app 진단 크롤러 (의료기관 웹사이트 SEO/AEO 진단) | 측정 필요 | "WinaidCrawler/1.0 (+contact)" 같은 정직한 식별자로 변경 시 일부 사이트의 WAF 차단 가능성 — 정량 평가 필요. |
| T04 (robots.txt 미준수) | • crawler-server 모든 라우트 | 측정 필요 (robots.txt 파싱 후 Disallow 일치율은 코드 추가 후에만 측정 가능) | `robots-parser` 도입 시 일부 페이지 fetch 가 자체 차단되어 콘텐츠 누락. 영향 범위는 robots.txt Disallow rule 에 의존. |
| T05 (자동 본문/태그 입력) | • winai-blog-publisher 발행 흐름 (사용자가 마지막 발행 버튼은 누름) | T02 와 동일 | 사용자 수동 복사·붙여넣기 fallback. 사용자 경험 큰 손상. |
| T06 (search.naver.com 자동 수집) | • 말투 학습기(`WritingStyleLearner`)<br>• 보도자료/리파인 등에서 외부 reference 가져오기 | 측정 필요 | 네이버 검색 공식 API (블로그 검색 — `https://openapi.naver.com/v1/search/blog`) 존재 가능성 — 변호사·기획 확인 후 전환 가능 여부 별도 평가. 본 자료는 권고하지 않음. |
| T07 (자동 입력 감지 우회) | • T02 와 동일 — 자동 로그인 안정성 | T02 와 동일 | T02 가 유지되는 한 본 우회 코드를 제거하면 캡챠 노출 빈도 증가 가능 (정량 데이터 없음). |

### 비즈니스 영향 메모 (사실 정리만)

- **T02 + T05 가 빠지면** winai-blog-publisher 데스크톱 앱의 핵심 가치는
  사라진다. 이 앱은 winai.kr 대시보드와 별도로 사용자가 직접 설치·실행하는
  로컬 도구로, 사용자 머신에서 `127.0.0.1:17580` 바인딩 + Bearer 토큰
  페어링으로 동작 (`winai-blog-publisher/src/api/server.ts:146`).
- **T01 + T06 이 빠지면** 말투 학습 / reference 흐름은 사용자가 URL 또는
  텍스트를 직접 붙여넣는 형태로만 동작 가능.
- **T04 (robots.txt 준수) 만 추가하는 경우** 다른 항목과 독립적으로 적용
  가능. 단, robots.txt 가 `Disallow: /` 같은 광범위 차단을 명시하면 T01·T06
  대상 페이지가 자체 차단됨.

---

## 3. 변호사 질문 체크리스트

각 질문은 **단답(Y/N + 근거 1-2문장) 가능**한 형태로 작성.
변호사 회신 시 항목 ID 별로 (a) 예/아니오, (b) 근거 약관·법령, (c) 권고
조치(있다면) 회신 권고.

### Q1. (T01 관련)
"`crawler-server/src/services/crawler.js:1-5, 113` 의 puppeteer-extra-plugin-stealth
+ `--disable-blink-features=AutomationControlled` 적용이 네이버 이용약관·운영정책상
'자동화 차단 우회' 에 해당하는가? Y/N + 근거 조항."

### Q2. (T02 관련)
"`winai-blog-publisher/src/naver/login.ts:107-162` 의 사용자 본인 동의 하에
저장된 본인 ID/PW 로 자동 로그인 후 (캡챠/2FA 시 사용자 직접 입력) 블로그
글쓰기 페이지로 진입하는 행위가 네이버 이용약관·블로그 약관상 금지되는
'자동 로그인 도구' / '자동 글 등록 도구' 에 해당하는가? Y/N + 근거."

### Q3. (T02 관련, 변형)
"같은 행위가 정보통신망법 §48 (정보통신망 침해행위 등의 금지)·기타 형사
조항에 해당할 가능성이 있는가? Y/N + 근거."

### Q4. (T03 관련)
"`Mozilla/5.0 ... Chrome/120.0.0.0 ...` UA 사용 (식별자 미포함) 이 네이버
이용약관 또는 일반 사이트 운영약관·정보통신망법상 별도의 위반에 해당하는가?
Y/N + 근거."

### Q5. (T04 관련)
"crawler-server 가 robots.txt 의 Disallow 규칙을 확인하지 않고
`https://blog.naver.com/PostView.naver?blogId=...&logNo=...` 등을 직접 fetch
하는 행위가 네이버 약관·정보통신망법·저작권법(데이터베이스권 포함)상 위반
가능성이 있는가? Y/N + 근거."

### Q6. (T05 관련)
"`winai-blog-publisher/src/naver/blogEditor.ts:108-134` 의 본문/태그 자동
입력 (사용자가 발행 버튼은 직접 클릭) 행위가 네이버 블로그 약관상 '자동 등록
도구' 에 해당하는가? '사용자가 마지막 클릭을 한다' 는 사실이 평가에 영향을
주는가? Y/N + 근거."

### Q7. (T06 관련)
"`crawler-server/src/services/crawler.js:127-195` 의 search.naver.com 검색
결과 페이지 자동 수집(1~10 페이지)이 네이버 약관·저작권법(데이터베이스권 포함)상
위반에 해당할 가능성이 있는가? 수집 데이터를 LLM 입력 reference 로 사용하는
점이 평가에 영향을 주는가? Y/N + 근거."

### Q8. (T06 변형)
"네이버 공식 블로그 검색 OpenAPI(`https://openapi.naver.com/v1/search/blog`)
또는 동등한 공식 채널이 본 사용 사례(병원 회원의 말투 학습용 reference 수집)
에 적법한 대안인가? 적법하다면 그 한계(쿼터, 데이터 사용범위)는 무엇인가?"

### Q9. (T07 관련)
"`page.evaluate` 로 input 의 value 를 직접 할당하는 자동 입력 패턴이 그 자체로
약관·법령 위반 평가에 영향을 주는가? T02 와 결합한 평가가 별도로 필요한가?
Y/N + 근거."

### Q10. (계정 정지 risk)
"위 T01~T07 어느 항목이라도 위반으로 판단될 경우, 대상은 (a) winai 회사,
(b) 사용자(병원 회원)의 네이버 계정, (c) 양쪽 모두 — 어느 쪽인가? 사용자
계정이 정지될 경우 사용자에게 사전 고지 의무가 있는가?"

### Q11. (사용자 고지 강화 시 면책 가능성)
"현행 약관 동의 외에, 본 도구가 자동화 도구임을 명시한 별도 고지(Onboarding
모달, 설치 시 약관 동의)를 추가할 경우 winai 회사의 책임 범위가 변하는가?
사용자에게 risk 가 이전되는가? 이전 가능 범위는 어디까지인가?"

### Q12. (대안: 공식 API 전환)
"T01·T06 을 네이버 검색 OpenAPI 로, T02·T05 를 사용자 수동 발행 + winai
가 콘텐츠를 클립보드/파일로 export 하는 형태로 전환하면, 약관·법령 risk 가
실질적으로 제거되는가? 잔존 risk 는 무엇인가?"

### Q13. (긴급도)
"위 7개 항목 중 즉시 코드에서 제거 권고하는 항목이 있다면 우선순위는?
즉시 제거가 아니라 사용자 고지 강화로 충분한 항목과 구분 권고."

---

## 4. 본 문서 사용 절차

1. **법무 검토 의뢰**
   - 본 문서를 PDF 로 변환해 외부 변호사(또는 사내 법무팀)에 전달.
   - 코드 access 가 필요할 경우 본 worktree 또는 main 의 (file:line) 직접
     열람 권한 제공.
   - 변호사가 약관 본문(이용약관·블로그 약관·운영정책)을 직접 확인하고
     §3 의 Q1~Q13 에 회신.

2. **회신 후 결정 (사업 + 법무)**
   - 항목별로 다음 중 하나를 선택:
     - (a) 현행 유지 (risk 수용)
     - (b) 사용자 고지 강화 (Onboarding/약관/UI 개선)
     - (c) 기능 제거 또는 비활성화
     - (d) 공식 API / 수동 흐름으로 전환
   - 본 결정은 **AI 가 제안하지 않는다**. ADR-3 의 출력은 본 문서까지.

3. **결정 후 코드 작업 트랙**
   - 코드 변경이 필요한 항목은 BL-C 후속 PR (사이클 2B-β3 트랙)에서
     처리. 각 PR 은 본 문서의 항목 ID (T0n) 를 참조하여 추적.

---

## 5. 다음 단계 (서비스 측)

- **변호사 회신 시점**: 미정. 사업/법무가 일정 결정.
- **회신 후 진행 가능한 코드 작업 후보 (실제 진행 여부는 결정 후 정함)**:
  - T01 / T03 → stealth 비활성, 정직한 식별자 UA, robots.txt 준수
    (`robots-parser` 도입) — 단일 PR 가능 (BL-C-T01·T03·T04 묶음).
  - T02 / T07 → 자동 로그인 / 자동 입력 우회 코드 제거 또는 사용자 직접
    로그인 흐름으로 전환 — winai-blog-publisher 별도 PR.
  - T05 → 자동 본문 입력 → 사용자 클립보드 export 전환 — winai-blog-publisher
    별도 PR.
  - T06 → 네이버 공식 블로그 검색 OpenAPI 전환 (대안 적법성 확인 후) —
    crawler-server 별도 PR.
- **운영성 회귀 (BL-C-002~024)**: 약관 risk 와 별개. 별도 트랙에서 처리
  권고.

---

## 6. 미확인 / 변호사 확인 필요

- 네이버 이용약관 / 블로그 약관 / 운영정책의 **현행** 본문 (조항 번호·문구) —
  AI 가 정확히 인용 어려움.
- 자동화 도구 사용에 대한 한국 판례 (대법원·하급심 공개 판결문) — AI 가
  정확 인용 어려움.
- 네이버 공식 검색 OpenAPI 의 사용 약관·쿼터·데이터 사용 범위 — 확인 필요.
- 사용자(병원 회원)의 네이버 계정이 정지될 경우 winai 의 사용자 고지·
  보상 책임 범위 — 확인 필요.
- robots.txt Disallow 미준수에 대한 한국 형사·민사 책임 인정 사례 — 확인
  필요.
- T05 의 "사용자가 마지막 발행 버튼을 누름" 이 약관 평가에 영향을 주는지 —
  확인 필요.
- T02 에서 캡챠/2FA 시 사용자 직접 입력으로 전환하는 흐름이 "캡챠 우회"
  평가에 어떻게 작용하는지 — 확인 필요.

---

## 부록 A. 영향받는 사용자 흐름 — 코드 위치 인덱스

읽는 변호사가 코드와 매핑할 수 있도록 file:line 고정 인덱스를 첨부.

### 크롤러(`crawler-server`)

- `src/index.js:88-93` — `/health` (인증 우회, exec 호출)
- `src/index.js:97` — `app.use('/api', bearerAuth())`
- `src/services/crawler.js:1-5` — puppeteer-extra + stealth (T01)
- `src/services/crawler.js:94-121` — `getBrowser()` (싱글톤, race 잔존)
- `src/services/crawler.js:113` — `--disable-blink-features=AutomationControlled` (T01)
- `src/services/crawler.js:127-195` — `crawlNaverBlogs` (T06)
- `src/services/crawler.js:136-138, 209-211, 260-264, 410, 527` — Chrome UA 위장 (T03)
- `src/routes/naver-crawler.js:43-57` — `validateNaverBlogUrl` 게이트
- `src/routes/youtube-gif.js:27-44` — `validateYouTubeUrl` 게이트

### 발행기(`winai-blog-publisher`)

- `src/api/server.ts:38` — Bearer 토큰 검증, `/status` 우회
- `src/api/server.ts:46-68` — `/account/register` (ID/PW 저장)
- `src/api/server.ts:91-103` — `/account/login-test` (T02 진입점)
- `src/api/server.ts:106-135` — `/publish` (T02 + T05 진입점)
- `src/api/server.ts:146` — `127.0.0.1:17580` 바인딩
- `src/naver/login.ts:107-162` — `naverLogin()` (T02)
- `src/naver/login.ts:114-128` — DOM evaluate 직접 값 할당 (T07)
- `src/naver/login.ts:142-152` — 캡챠/2FA 사용자 입력 대기 (T02)
- `src/naver/blogEditor.ts:108-134` — 본문 자동 입력 `insertHTML` (T05)
- `src/naver/blogEditor.ts:136-149` — 태그 자동 입력 (T05)
- `src/utils/crypto.ts` — AES-256-GCM 자격증명 보관 (T02 입력)

### 진단 크롤러(`public-app/lib/diagnostic`)

- `crawler.ts:14-16` — Chrome UA 위장 (T03 — diagnostic 측)
- `crawler.ts` 내 `crawlSite` — `safeFetch` (사설 IP 차단) 사용
- `robotsSitemap.ts` — robots.txt 진단 목적 읽기 (Disallow 우회 여부 확인 필요)

### 클라이언트 진입점

- `next-app/components/WritingStyleLearner.tsx` — 말투 학습 UI (T01·T06 의존)
- `next-app/app/(dashboard)/refine/page.tsx:133-134` — `/api/naver/crawl-hospital-blog` 호출
- `next-app/app/(dashboard)/blog/BlogFormPanel.tsx:613` — WritingStyleLearner 임베드
- `next-app/app/api/internal/crawl-hospital-blog/route.ts` — server proxy → crawler-server
- `public-app/app/api/naver/crawl-hospital-blog/route.ts` — public 진입
- `public-app/app/api/diagnostic/route.ts` — 진단 라우트 (T03 진단 측)

---

## 부록 B. 본 문서가 다루지 않는 항목

다음은 본 문서 범위 외 — BL-C 보고서의 별도 섹션 또는 다른 ADR 에서 처리:

- SSRF / 사설 IP 차단 미흡 (BL-C-001) — 별도 보안 트랙.
- bearerAuth skipPaths 회귀 (BL-C-002) — 운영성 트랙.
- `/health` execSync DoS (BL-C-003) — 운영성 트랙.
- Puppeteer launch race (BL-C-004) — 운영성 트랙.
- 의존성 lag (BL-C-020~024) — 의존성 ADR (별도).
- 자격증명 plain memory 잔존 (BL-C-011) — 보안 트랙.
- DOMPurify `style` 속성 sanitize (BL-C-016) — 보안 트랙.
- referenceFetcher prompt injection 회귀 (BL-C-017 / SEC-006) — 별도 fix PR.

본 문서는 **약관 risk 7건만 다룬다**. 위 항목들은 약관과 무관하므로 별도
트랙 진행 권고.
