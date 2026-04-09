FROM node:22-slim

# FFmpeg + Python + 한글 폰트
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    python3-venv \
    fonts-noto-cjk \
    curl \
    && rm -rf /var/lib/apt/lists/*

# auto-editor를 venv에 설치 (--break-system-packages 문제 회피)
RUN python3 -m venv /opt/autoeditor && \
    /opt/autoeditor/bin/pip install auto-editor && \
    ln -s /opt/autoeditor/bin/auto-editor /usr/local/bin/auto-editor

# 설치 확인
RUN ffmpeg -version | head -1 && auto-editor --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3002

CMD ["node", "src/index.js"]
