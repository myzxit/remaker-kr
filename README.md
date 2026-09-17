# 리메이커 (Remaker)

영상의 **목소리·효과음·자막을 걷어내고 새로 입힙니다.** 결과 길이를 1분에서 25분 사이로 정하면
대본과 화면이 거기에 맞춰 재구성됩니다. 크레딧도 결제도 없습니다.

```
링크 / 파일
    ↓  yt-dlp
  원본 영상
    ↓  ffmpeg → faster-whisper
  무슨 말을 하는지 (문장 + 시각)
    ↓  목표 길이에 맞춰 문장 선별·정리
  새 대본
    ↓  edge-tts (문장별 타임코드 포함)
  새 목소리
    ↓  나레이션 길이에 맞춰 원본 화면 재배치 + 효과음 + 새 자막
  새 영상 mp4
```

**원본 오디오는 섞이지 않습니다.** 안 섞는 게 아니라 아예 가져오지 않습니다 —
렌더링할 때 오디오는 새로 만든 트랙에서만 가져옵니다.

## 도구

| 도구 | 하는 일 | 상태 |
|---|---|---|
| 🔁 영상 재구성 | 목소리·효과음·자막을 전부 새로 입히고 길이를 맞춤 | 동작 |
| 🌏 다국어 더빙 | 5개 언어 자막 + 그 나라 목소리 | 동작 |
| ⬇️ 영상 가져오기 | 유튜브·인스타그램·틱톡 링크에서 원본 확보 | 동작 |
| 📦 보관함 | 원본·결과물 모아 보기 | 동작 |
| ✂️ 숏폼 만들기 | 하이라이트를 골라 세로 영상으로 | 예정 |
| ⚡ 무음 제거 | 말이 끊긴 구간 잘라내기 | 예정 |
| 💬 댓글 이미지 | 댓글 카드 그래픽 생성 | 예정 |
| 🛡️ 정책 사전 점검 | 올리기 전 걸릴 만한 표현 찾기 | 예정 |
| 🎨 이미지 생성·편집 | 외부 SD 엔진 연결 (`IMAGE_API_URL`) | 엔진 필요 |
| 📈 트렌드 | 나라별 인기 급상승 (`YOUTUBE_API_KEY`) | API 키 필요 |

## 되는 것과 안 되는 것

**됩니다**

- 원본 목소리·배경음·효과음 제거 (오디오 트랙을 아예 안 가져옴)
- 새 내레이션 (한국어 3종 포함 5개 언어, API 키 불필요)
- 새 자막 — 타이밍을 추정하지 않고 음성 합성이 준 문장별 시각을 그대로 사용
- 결과 길이 1~25분 지정
- 전환 효과음 (ffmpeg 로 합성, 음원 라이선스 문제 없음)
- 16:9 · 9:16 · 1:1 전환

**안 됩니다**

- **화면에 구워진 자막을 깨끗이 지우기.** 영상 인페인팅이 필요해서 GPU 없이는
  현실적이지 않습니다. 대신 `덮기`(기본) · `잘라내기` · `흐리게` 중에 고릅니다.
- **없는 내용 지어내기.** 원본 문장을 고르고 다듬을 뿐, 새 문장을 창작하지 않습니다.
- **말소리 없는 영상 처리.** 받아 적을 말이 있어야 대본이 나옵니다.

## 필요한 것

| 도구 | 용도 | 없으면 |
|------|------|--------|
| Node.js 20+ | 웹 앱 | 필수 |
| `ffmpeg`, `ffprobe` | 영상 처리 | 필수 |
| Python 3.9+ · `faster-whisper` | 음성 인식 | 필수 |
| `edge-tts` | 음성 합성 (무료, 키 불필요) | 필수 |
| `yt-dlp` | 링크에서 영상 가져오기 | 파일 업로드만 가능 |
| 한글 글꼴 | 자막 렌더링 | 자막이 □□□ 로 나옵니다 |

```bash
# Debian / Ubuntu
sudo apt-get install -y ffmpeg fonts-nanum python3-pip
pip install -U yt-dlp faster-whisper edge-tts
```

## 설치

```bash
git clone https://github.com/myzxit/remaker-kr.git
cd remaker-kr
npm install

cp .env.example .env
openssl rand -base64 32     # 출력값을 .env 의 AUTH_SECRET 에 넣습니다

npm run db:push
```

터미널 두 개로 띄웁니다. **웹만 띄우면 작업이 큐에 쌓인 채 처리되지 않습니다.**

```bash
npm run dev            # 1) 웹 (http://localhost:3000)
npm run worker         # 2) 워커
```

**첫 번째로 가입하는 계정이 관리자가 됩니다.**

## 서버에 배포

```bash
git clone https://github.com/myzxit/remaker-kr.git && cd remaker-kr

cat > .env <<EOF
AUTH_SECRET=$(openssl rand -base64 32)
SITE_URL=https://내도메인.example.com
WHISPER_MODEL=small
EOF

docker compose up -d --build
```

`http://서버주소:3000` 으로 열립니다. 첫 빌드는 5~15분(모델 다운로드 포함), 이미지는 약 3GB,
최소 사양은 2 vCPU / 4GB RAM 입니다. GPU 가 있으면 `WHISPER_DEVICE=cuda`,
`WHISPER_COMPUTE_TYPE=float16` 으로 훨씬 빨라집니다.

## 동작 확인

웹 없이 재구성 경로만 바로 돌려 볼 수 있습니다.

```bash
# 원본을 storage/ 아래에 두고
npx tsx scripts/test-remake.ts storage/내영상.mp4
```

## 설정

`.env.example` 참고. 자주 건드리는 값:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `WHISPER_MODEL` | `small` | `tiny`~`large-v3`. 클수록 정확하고 느립니다 |
| `WHISPER_DEVICE` | `cpu` | GPU 면 `cuda` |
| `SUBTITLE_FONT` / `SUBTITLE_FONT_DIR` | `NanumGothic` | 글꼴 이름 / 글꼴 폴더 |
| `FFMPEG_PRESET` | `veryfast` | `ultrafast` 면 빠르고 용량이 큽니다 |
| `WORKER_CONCURRENCY` | `1` | 동시 처리 수 |
| `IMAGE_API_URL` | 빈 값 | 넣으면 이미지 도구가 켜집니다 |
| `YOUTUBE_API_KEY` | 빈 값 | 넣으면 트렌드 도구가 켜집니다 |

## 구조

```
src/
  app/                 # 랜딩 · 도구 · 작업실 · 보관함 · 약관
    api/               # 인증 · 업로드 · 작업 · 미디어 서빙
  lib/
    tools.ts           # 도구 카탈로그 + 옵션 스키마(랜딩·검증·워커가 공유)
    voices.ts          # 목소리 목록
    subtitleStyles.ts  # 자막 스타일
worker/
  index.ts             # DB 폴링 큐
  pipeline.ts          # 도구별 분기
  script.ts            # 대본 재구성 · 화면 배정
  tts.ts               # 음성 합성 + 문장별 타임코드
  remake.ts            # 오디오 트랙 · 자막 처리 · 최종 렌더
  subtitles.ts         # 자막 분할 · ASS 생성
  transcribe.py        # faster-whisper 호출
```

## 꼭 알아두실 것

- **본인이 권리를 가진 영상에만 쓰세요.** 남의 영상을 재구성해 올리는 것은 저작권 침해이고,
  플랫폼의 재사용 콘텐츠 정책에도 걸립니다. 자세한 내용은 앱의 `/legal/copyright` 에 있습니다.
- **대본 텍스트는 외부로 나갑니다.** 음성 합성이 Microsoft Edge 의 읽어주기 서비스를 호출하기
  때문입니다. 영상과 음성 파일은 서버 밖으로 나가지 않습니다.
- **FFmpeg 라이선스**는 빌드에 포함된 코덱 구성에 따라 달라집니다. 상업 배포 시 확인하세요.
- **edge-tts 는 GPL-3.0** 입니다. 별도 프로세스로 호출해 쓰고 있습니다.
- 저장소는 로컬 디스크 기준입니다. 여러 대로 늘리려면 `src/lib/paths.ts` 를 오브젝트
  스토리지로 바꾸세요.

## 라이선스

MIT. 오픈소스 고지는 앱의 `/legal/oss` 페이지에 있습니다.
