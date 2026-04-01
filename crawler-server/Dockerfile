FROM node:22-slim

# Chromium 의존성 설치 (puppeteer-core용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-cjk \
    ffmpeg \
    python3 \
    python3-pip \
    && pip3 install --break-system-packages yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Chromium 경로를 환경변수로 설정
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# 의존성 먼저 설치 (캐시 레이어)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 소스 복사
COPY . .

EXPOSE 3001

CMD ["node", "src/index.js"]
