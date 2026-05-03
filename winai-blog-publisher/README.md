# WINAI Blog Publisher

네이버 블로그 자동 발행 로컬 앱.
winai.kr에서 생성한 블로그 글을 네이버 블로그에 서식 포함 자동 입력합니다.

## 설치

```bash
cd winai-blog-publisher
npm install
npm run setup   # Playwright 크롬 브라우저 설치
```

## 실행

```bash
npm start
```

실행하면 로컬 API 서버가 `http://localhost:17580`에서 시작됩니다.

## 사용법

1. `npm start`로 앱 실행
2. **콘솔에 표시되는 페어링 토큰 (64-byte hex) 을 복사**
3. winai.kr 의 페어링 페이지에 토큰 paste (1회만)
4. winai.kr에서 블로그 글 생성
5. "네이버 발행" 버튼 클릭 (winai.kr 가 토큰을 헤더에 담아 호출)
6. 처음이면 계정 등록 (네이버 ID/PW/블로그 ID)
7. 자동으로 크롬이 열리고 네이버 로그인 → 블로그 에디터에 제목/본문/태그 입력
8. **이미지는 직접 추가, 발행 버튼도 직접 클릭**

### 페어링 토큰 분실 / 노출 시

```bash
# 토큰 파일 삭제 → 다음 실행 시 새 토큰 발급
rm ~/.winai-publisher/token
npm start    # 새 토큰 콘솔 출력 → winai.kr 에 다시 paste
```

## API

| Method | URL | 설명 |
|--------|-----|------|
| GET | `/status` | 앱 실행 상태 확인 |
| POST | `/account/register` | 네이버 계정 등록 |
| GET | `/account/list` | 계정 목록 |
| DELETE | `/account/:id` | 계정 삭제 |
| POST | `/account/login-test` | 로그인 테스트 |
| POST | `/publish` | 블로그 발행 (자동 입력) |
| POST | `/shutdown` | 앱 종료 |

## 포트

`17580` (고정)

## 보안

### Bearer 토큰 인증
- 모든 라우트 (`/status` 제외) 는 `Authorization: Bearer <token>` 헤더 검증
- 토큰: 64-byte 무작위 hex, `~/.winai-publisher/token` (mode 0600)
- 사용자 머신의 다른 프로세스 / DNS rebinding / 외부 페이지 요청 차단
- timing-safe 비교 (`crypto.timingSafeEqual`)

### 자격증명 암호화
- AES-256-GCM (authenticated encryption)
- 키: 32-byte 무작위, `~/.winai-publisher/encryption.key` (mode 0600)
- v1 (CryptoJS, 하드코딩 키) 파일 검출 시 자동 마이그레이션 (옛 키 → 새 키 재암호화)
- 마이그레이션 실패 시 명시적 에러 + 사용자 재로그인 안내

### HTML sanitize
- 본문 HTML 은 DOMPurify 로 sanitize 후 네이버 에디터 주입
- `<script>`, on* 핸들러, `javascript:` URI 차단 → 네이버 쿠키 XSS 탈취 방어

### CORS
- 프로덕션: `https://winai.kr` / `https://www.winai.kr` 만 허용
- 개발 (`NODE_ENV !== 'production'`): localhost:3000/3001 추가 허용

### 파일 위치
- `credentials/` (앱 디렉토리): 자격증명 + 세션
- `~/.winai-publisher/`: 토큰 + 암호화 키

`credentials/`, `~/.winai-publisher/` 모두 `.gitignore`/외부 노출 금지.
