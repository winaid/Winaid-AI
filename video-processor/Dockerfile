FROM python:3.12-slim

# Node.js 22 설치
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    fonts-noto-cjk \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# auto-editor 설치 (Python 3.12 기반이므로 GLIBC 문제 없음)
RUN pip install --no-cache-dir auto-editor

# 설치 확인
RUN ffmpeg -version | head -1 && auto-editor --version && node --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY sfx ./sfx

EXPOSE 3002

CMD ["node", "src/index.js"]
