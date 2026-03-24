FROM node:22-slim

# Chromium + 한글 폰트
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# crawler-server 의존성만 설치
COPY crawler-server/package.json crawler-server/package-lock.json ./
RUN npm ci --omit=dev

# crawler-server 소스만 복사
COPY crawler-server/src ./src

EXPOSE 3001

CMD ["node", "src/index.js"]
