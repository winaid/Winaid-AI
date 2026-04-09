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
2. winai.kr에서 블로그 글 생성
3. "네이버 발행" 버튼 클릭
4. 처음이면 계정 등록 (네이버 ID/PW/블로그 ID)
5. 자동으로 크롬이 열리고 네이버 로그인 → 블로그 에디터에 제목/본문/태그 입력
6. **이미지는 직접 추가, 발행 버튼도 직접 클릭**

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

- 계정 정보는 AES 암호화하여 `credentials/` 폴더에 로컬 저장
- 네이버 세션은 `credentials/session_*.json`에 저장 (재로그인 최소화)
- `credentials/` 폴더는 `.gitignore`에 포함
