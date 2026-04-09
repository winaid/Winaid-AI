FROM node:22-slim

# FFmpeg + auto-editor + 한글 폰트
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    fonts-noto-cjk \
    && pip3 install --break-system-packages auto-editor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3002

CMD ["node", "src/index.js"]
