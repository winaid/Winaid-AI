# Agent C — Server services (FFmpeg / Puppeteer / Playwright)

## Day 1 회귀 검증 (전부 정상 유지)
- drawtext textfile 치환 — `add-intro-outro.js:81-87, 115-121`, `generate-thumbnail.js:66-69`
- X-API-Secret 인증 — `video-processor/src/index.js:68-74` (timing-safe, dev 자동 시크릿)
- protocol_whitelist file,pipe — `add-intro-outro.js:152`, `apply-style.js:251`, `card-to-shorts.js:143,188`
- /health 정보 최소화 — `crawler-server/src/index.js:88-93`, `video-processor/src/index.js:50-63`
- HuggingFace fetch timeout — `crawler.js:281` AbortSignal.timeout(8000)

## 잔여 위협

### [SVR-001] add-bgm 비대칭 인증 우회 표면 없음 — 정상
- 카테고리: 정보 / `video-processor/src/index.js:68 → 87-95`

### [SVR-002] crawler-server bearerAuth skipPaths 미활용 → 향후 회귀 위험
- 카테고리: 보안 / Low / `crawler-server/src/index.js:97`
- 수정: `app.use(bearerAuth(['/health']))` 명시

### [SVR-003] /health가 인증 없이 execSync(yt-dlp/ffmpeg/auto-editor) — DoS surface
- 카테고리: 성능 / Low~Medium / `crawler-server/src/index.js:88-93`, `video-processor/src/index.js:50-58`
- 영향: 초당 수십 hit → 이벤트 루프 블로킹 + fork bomb
- 수정: 부팅 시 1회 검사 후 in-memory 캐시

### [SVR-004] apply-style 동시성 한계 부재 — Gemini quota 폭발 + 디스크 폭발
- 카테고리: 성능 / Medium / `video-processor/src/routes/apply-style.js:111-180`
- N개 동시 요청 시 N×3 Gemini 호출 + N×20 프레임 디스크
- 수정: p-limit / BullMQ 큐

### [SVR-005] silence-remove auto-editor — 정상 (execFile array, safeExt)

### [SVR-006] add-bgm BGM_ID_RE 우회 — graceful fallback, 영향 없음 / Low

### [SVR-007] add-zoom zoompan — 인젝션 차단됨 (정상)

### [SVR-008] card-to-shorts multer tmp 파일 cleanup 누락 — 디스크 폭발
- 카테고리: 버그 / Medium / `card-to-shorts.js:97-127, 308-313`
- multer가 os.tmpdir()에 직접 dest, workDir 외부 → cleanup 누락
- 수정: 응답 끝에 images/narration_audio 각각 unlinkSync

### [SVR-009] 모든 video-processor 라우트 multer fail-fast 시 tmp 잔재
- 카테고리: 버그 / Low
- 수정: catch + 응답 종료 핸들러에서 req.file?.path unlink

### [SVR-010] crop-vertical / add-zoom runFfmpeg timeout 미지정 — 5분 default
- 카테고리: 성능 / Low / `crop-vertical.js:54-64`, `add-zoom.js:46-53`

### [SVR-011] /health, / 미인증 — 의도된 디자인 (OK)

### [SVR-012] crawler-server bearerAuth chaining — 단일 진입점 견고

### [SVR-013] Puppeteer 브라우저 싱글톤 race condition — OOM 위험
- 카테고리: 성능/버그 / Medium / `crawler-server/src/services/crawler.js:7, 92-121`
- 동시 부팅 요청 → puppeteer.launch 2번 → 첫 번째 인스턴스 leak (~250MB)
- 수정: launch promise 캐싱

### [SVR-014] --no-sandbox Puppeteer — Docker root 환경 불가피 (info)
- Dockerfile 비-root user 분리 미적용 — 향후 보강 권장

### [SVR-015] crawl-search query 길이 캡 부재 — Low
- 수정: query.length > 200 거부

### [SVR-016] youtube-gif Bearer 통과 후 yt-dlp execFile array — 안전
- 가벼운 우려: findOutputFile prefix 매칭으로 .part 잔재 픽업 가능 (impact 작음)

### [SVR-017] apply-style Gemini 모델 ID 하드코딩 + silent fallback to 원본
- 카테고리: AI 특이사항 / Low / `apply-style.js:120`
- 모델: `gemini-3.1-flash-lite-preview`, `gemini-3-pro-image-preview`
- 실패 시 원본 그대로 복사하면서 사용자에겐 "AI 변환 성공" 응답
- 수정: frames_failed 메타데이터 + 50% 이상 실패 시 502

### [SVR-018] add-sound-effects Gemini 응답 검증 약함 — 실제 영향 없음 (info)

### [SVR-019] apply-style Gemini base64 디코딩 무검증 — TLS+workDir 격리로 안전 (info)

### [SVR-020] winai-blog-publisher /account/register naver_id 빈 문자열 시 'account_.enc' 생성
- 카테고리: 보안 / Low / `winai-blog-publisher/src/api/server.ts:46-68`
- 수정: accountId.length < 1 → 400

### [SVR-021] winai-blog-publisher naver_pw 로그 누출 없음 (정상)

### [SVR-022] winai-blog-publisher 127.0.0.1 bind + CORS 화이트리스트 (정상)

### [SVR-023] Playwright headless: false — 캡챠/2FA 위한 의도된 design

### [SVR-024] insertHTML 후 네이버 에디터 sanitize 의존
- 카테고리: 보안 / Low / `blogEditor.ts:119-123`
- DOMPurify ALLOWED_ATTR에 style 포함, 네이버 에디터 sanitize에 의존

### [SVR-025] crawler-server CORS 와일드카드 정규식 견고 (정상)

### [SVR-026] video-processor CORS strict equal — 빈 entry 경계 검사 없음 (hardening)

### [SVR-027] videoProxy.ts secret 미설정 시 헤더 생략 — production에서 fail-fast 안 됨
- 카테고리: 보안 / Low / `public-app/lib/videoProxy.ts:22-26`
- 수정: production에서 PROCESSOR_SHARED_SECRET 누락 시 startup throw

### [SVR-028] public-app crawl-hospital-blog는 자체 fetch (정상, hostname 화이트리스트 견고)

### [SVR-029] youtube/page.tsx dead CRAWLER_URL — 정리 권장 (정보)

## 통계
| 카테고리 | Medium | Low | 정보 |
|---|---|---|---|
| 보안 | 0 | 5 | 7 |
| 버그 | 1 | 2 | 0 |
| 성능/운영 | 2 | 3 | 0 |
| AI 특이사항 | 0 | 2 | 0 |
| 코드 위생 | 0 | 0 | 1 |

## 핵심 결론
1. Day 1 처리 사항 전부 회귀 없이 유지
2. 명령어 인젝션 사실상 차단 (execFile array, safeExt)
3. SSRF 방어 견고 (new URL() + hostname strict)
4. 실질 개선 Top 3: SVR-008 (card-to-shorts cleanup), SVR-013 (Puppeteer race), SVR-003 (/health DoS)
5. 운영 측 부재: 큐/concurrency, 메트릭, 글로벌 timeout 표준화
