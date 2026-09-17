/**
 * 댓글 카드 이미지.
 *
 * 영상 위에 얹기 좋은 카드 PNG 를 그립니다. 이미지 라이브러리를 새로 들이지 않고
 * ffmpeg 의 drawbox·drawtext 만 씁니다 — 어차피 ffmpeg 는 필수라서요.
 *
 * 글자는 filter 인자에 넣지 않고 textfile 로 넘깁니다. 한국어 문장에 섞이는
 * 쉼표·따옴표·콜론을 일일이 이스케이프하지 않아도 되고, 깨질 일이 없습니다.
 */

import fs from "node:fs";
import path from "node:path";
import { run, FFMPEG, escapeFilterPath } from "./ffmpeg";

const WIDTH = 1080;
const PAD = 56;
const AVATAR = 104;
const BODY_SIZE = 44;
const BODY_LINE = 66;
const NAME_SIZE = 38;
const META_SIZE = 32;
/**
 * 본문 한 줄에 들어갈 글자 수.
 *
 * 한글은 글자 하나가 글자 크기만큼 차지한다(영문처럼 0.5~0.6 이 아니다).
 * 영문 폭으로 잡으면 줄이 화면 밖으로 삐져나간다.
 */
const BODY_MAX_CHARS = Math.floor((WIDTH - PAD * 2 - AVATAR - 28) / (BODY_SIZE * 1.02));

export type CommentTheme = "light" | "dark";

const THEMES: Record<CommentTheme, { card: string; name: string; body: string; meta: string; avatar: string }> = {
  dark: { card: "0x16181C", name: "0xF4F6F8", body: "0xE2E6EA", meta: "0x8C949E", avatar: "0x4F46E5" },
  light: { card: "0xFFFFFF", name: "0x14181F", body: "0x2B3138", meta: "0x8A929B", avatar: "0x4F46E5" },
};

/** 글꼴 파일 경로. libass 와 달리 drawtext 는 이름이 아니라 파일을 받는다. */
export function resolveFontFile(): string {
  const explicit = process.env.SUBTITLE_FONT_FILE;
  if (explicit && fs.existsSync(explicit)) return explicit;

  const dir = process.env.SUBTITLE_FONT_DIR;
  if (dir && fs.existsSync(dir)) {
    const found = fs.readdirSync(dir).find((f) => /\.(ttf|otf)$/i.test(f));
    if (found) return path.join(dir, found);
  }

  const candidates = [
    "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
  ];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) {
    throw new Error(
      "한글 글꼴 파일을 찾지 못했습니다. fonts-nanum 을 설치하거나 SUBTITLE_FONT_FILE 에 .ttf 경로를 지정해 주세요."
    );
  }
  return hit;
}

/** 글자 수 기준 줄바꿈. 단어를 가능하면 자르지 않는다. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }

      // 띄어쓰기 없이 긴 덩어리는 잘라서라도 넣는다.
      while (line.length > maxChars) {
        lines.push(line.slice(0, maxChars));
        line = line.slice(maxChars);
      }
    }
    if (line) lines.push(line);
  }

  return lines.length > 0 ? lines : [""];
}

const formatLikes = (n: number) => n.toLocaleString("ko-KR");

export async function renderCommentCard(opts: {
  nickname: string;
  body: string;
  likes: number;
  theme: CommentTheme;
  outDir: string;
  fileBase: string;
}): Promise<{ imagePath: string; width: number; height: number; lines: number }> {
  fs.mkdirSync(opts.outDir, { recursive: true });

  const theme = THEMES[opts.theme] ?? THEMES.dark;
  const font = escapeFilterPath(resolveFontFile());
  const lines = wrapText(opts.body.trim(), BODY_MAX_CHARS);

  const textLeft = PAD + AVATAR + 28;
  const bodyTop = PAD + NAME_SIZE + 22;
  const height = Math.ceil((bodyTop + lines.length * BODY_LINE + META_SIZE + PAD + 14) / 2) * 2;

  // 글자는 전부 파일로 넘긴다.
  const textDir = fs.mkdtempSync(path.join(opts.outDir, "text-"));
  const writeText = (name: string, value: string) => {
    const file = path.join(textDir, `${name}.txt`);
    fs.writeFileSync(file, value, "utf-8");
    return escapeFilterPath(file);
  };

  // drawbox 는 색만 칠하고 투명도 채널은 건드리지 않는다 — 투명 캔버스에 칠하면
  // 색은 들어가지만 그대로 안 보인다. 그래서 카드 색을 아예 바탕으로 깐다.
  const filters: string[] = [
    `drawbox=x=${PAD}:y=${PAD}:w=${AVATAR}:h=${AVATAR}:color=${theme.avatar}:t=fill`,
  ];

  const initial = opts.nickname.trim().slice(0, 1) || "?";
  filters.push(
    `drawtext=fontfile='${font}':textfile='${writeText("initial", initial)}':` +
      `fontcolor=0xFFFFFF:fontsize=52:x=${PAD}+(${AVATAR}-tw)/2:y=${PAD}+(${AVATAR}-th)/2`
  );

  filters.push(
    `drawtext=fontfile='${font}':textfile='${writeText("name", opts.nickname.trim())}':` +
      `fontcolor=${theme.name}:fontsize=${NAME_SIZE}:x=${textLeft}:y=${PAD + 4}`
  );

  lines.forEach((line, i) => {
    filters.push(
      `drawtext=fontfile='${font}':textfile='${writeText(`body${i}`, line)}':` +
        `fontcolor=${theme.body}:fontsize=${BODY_SIZE}:x=${textLeft}:y=${bodyTop + i * BODY_LINE}`
    );
  });

  filters.push(
    `drawtext=fontfile='${font}':textfile='${writeText("meta", `좋아요 ${formatLikes(opts.likes)}개 · 답글 달기`)}':` +
      `fontcolor=${theme.meta}:fontsize=${META_SIZE}:x=${textLeft}:y=${bodyTop + lines.length * BODY_LINE + 10}`
  );

  const imagePath = path.join(opts.outDir, `${opts.fileBase}.png`);
  await run(FFMPEG, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${theme.card}:s=${WIDTH}x${height},format=rgb24`,
    "-vf", filters.join(","),
    "-frames:v", "1",
    imagePath,
  ]);

  fs.rmSync(textDir, { recursive: true, force: true });

  if (!fs.existsSync(imagePath)) throw new Error("댓글 이미지를 만들지 못했습니다.");
  return { imagePath, width: WIDTH, height, lines: lines.length };
}
