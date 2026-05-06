FROM node:22-slim

ARG CACHE_BUST=20260506v1

# Chromium 의존성 설치 (puppeteer-core용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-cjk \
    ffmpeg \
    python3 \
    python3-pip \
    && pip3 install --break-system-packages --upgrade yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Chromium 경로를 환경변수로 설정
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# 비-root user 생성 (SVR-014).
# Chromium 은 --no-sandbox 로 실행되므로 만에 하나 RCE 시 컨테이너 root 와
# 동일 권한이 됨. Railway 컨테이너 격리가 마지막 방어선이지만, 추가 layer 로
# 비특권 user 분리. 홈 디렉터리는 puppeteer cache / yt-dlp 임시 파일 등에 필요.
RUN useradd --create-home --home-dir /home/app --shell /bin/bash --uid 1001 app

# 의존성 먼저 설치 (캐시 레이어) — root 로 npm ci 후 ownership 변경.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 소스 복사
COPY . .

# /app 전체 ownership 을 app 으로 — node_modules 포함.
RUN chown -R app:app /app

# 비-root 로 전환. 이후 모든 명령은 app user 로 실행.
USER app

EXPOSE 3001

CMD ["node", "src/index.js"]
