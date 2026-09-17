# 리메이커 단일 이미지. 웹과 워커가 같은 이미지를 쓰고 entrypoint 인자로 역할만 나눈다.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# ffmpeg: 영상 처리 / fonts-nanum: 한글 자막 / python3: 음성 인식과 음성 합성
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg \
       fonts-nanum \
       python3 \
       python3-pip \
       ca-certificates \
       openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt yt-dlp

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .

# 빌드 단계에서는 DB에 붙지 않는다. 스키마 검증용 더미 값.
RUN DATABASE_URL="file:/tmp/build.db" AUTH_SECRET="build-only" npm run build

# 음성 인식 모델을 이미지에 미리 받아 둔다.
# 없으면 첫 작업에서 모델을 내려받느라 몇 분씩 멈춘 것처럼 보인다.
ARG WHISPER_MODEL=small
ENV HF_HOME=/models
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

ENV NODE_ENV=production \
    WHISPER_MODEL=${WHISPER_MODEL} \
    SUBTITLE_FONT=NanumGothic \
    DATABASE_URL="file:/data/app.db" \
    STORAGE_DIR=/data/storage \
    PORT=3000

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["web"]
