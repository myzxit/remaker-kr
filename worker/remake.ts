/**
 * 영상 재구성 렌더러.
 *
 * 원본 오디오는 아예 가져오지 않는다(-an 이 아니라 애초에 map 하지 않는다).
 * 화면만 원본에서 떼어와 이어 붙이고, 새 나레이션·효과음·자막을 얹는다.
 *
 * ffmpeg 를 두 번 부른다. 한 번에 하면 필터 그래프가 너무 길어져 디버깅이 어렵다.
 *   1) 오디오: 나레이션 + 효과음 → 한 트랙
 *   2) 화면: 구간 이어 붙이기 → 자막 영역 처리 → 비율 맞추기 → 자막 굽기 → 오디오 합치기
 */

import fs from "node:fs";
import path from "node:path";
import { FFMPEG, run, escapeFilterPath } from "./ffmpeg";
import { buildAss, type Caption } from "./subtitles";
import type { SubtitleStyle } from "../src/lib/subtitleStyles";
import { ASPECTS } from "../src/lib/tools";

const PRESET = process.env.FFMPEG_PRESET || "veryfast";
const CRF = process.env.FFMPEG_CRF || "21";
const SUBTITLE_FONT = process.env.SUBTITLE_FONT || "NanumGothic";
const SUBTITLE_FONT_DIR = process.env.SUBTITLE_FONT_DIR || "";

export type Clip = { start: number; end: number };

export const getAspect = (id: string) => ASPECTS.find((a) => a.id === id) ?? ASPECTS[0];

/**
 * 전환 효과음을 하나 합성해 둔다.
 * 음원 파일을 같이 배포하면 라이선스를 따져야 해서, 필요한 소리를 ffmpeg 로 직접 만든다.
 */
export async function makeWhoosh(outPath: string): Promise<string> {
  if (fs.existsSync(outPath)) return outPath;

  await run(FFMPEG, [
    "-y",
    "-f", "lavfi",
    "-i", "anoisesrc=d=0.4:c=pink:a=0.35",
    "-af",
    [
      "highpass=f=400",
      "lowpass=f=5200",
      "afade=t=in:st=0:d=0.06",
      "afade=t=out:st=0.14:d=0.26",
      "volume=0.6",
    ].join(","),
    "-ar", "44100", "-ac", "2",
    outPath,
  ]);
  return outPath;
}

/** 나레이션과 효과음을 한 트랙으로 섞는다. */
export async function buildAudioTrack(opts: {
  narrationPath: string;
  sfxTimes: number[];
  sfxPath: string | null;
  outPath: string;
  durationSec: number;
}): Promise<string> {
  // 효과음이 없으면 나레이션을 그대로 쓴다.
  if (!opts.sfxPath || opts.sfxTimes.length === 0) {
    await run(FFMPEG, [
      "-y", "-i", opts.narrationPath,
      "-ar", "44100", "-ac", "2",
      "-c:a", "aac", "-b:a", "160k",
      opts.outPath,
    ]);
    return opts.outPath;
  }

  // 효과음을 너무 많이 깔면 정신없다. 최대 12개까지만.
  const times = opts.sfxTimes.slice(0, 12);

  const args = ["-y", "-i", opts.narrationPath];
  for (let i = 0; i < times.length; i++) args.push("-i", opts.sfxPath);

  const filters: string[] = [];
  const mixInputs = ["[0:a]"];

  times.forEach((t, i) => {
    const delayMs = Math.max(0, Math.round(t * 1000));
    filters.push(`[${i + 1}:a]adelay=${delayMs}|${delayMs},volume=0.35[s${i}]`);
    mixInputs.push(`[s${i}]`);
  });

  filters.push(
    `${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0,` +
      `alimiter=limit=0.95[aout]`
  );

  await run(FFMPEG, [
    ...args,
    "-filter_complex", filters.join(";"),
    "-map", "[aout]",
    "-ar", "44100", "-ac", "2",
    "-c:a", "aac", "-b:a", "160k",
    opts.outPath,
  ]);

  return opts.outPath;
}

/** 원본에 박혀 있는 자막을 어떻게 처리할지 */
function cleanupFilter(mode: string, inLabel: string, outLabel: string): string {
  switch (mode) {
    case "crop":
      // 아래쪽을 잘라낸다. 자막이 확실히 사라지지만 화면이 좁아진다.
      return `[${inLabel}]crop=iw:floor(ih*0.86/2)*2:0:0[${outLabel}]`;
    case "blur":
      // 자막이 있던 띠만 뭉갠다. 글자 자국은 남는다.
      return (
        `[${inLabel}]split=2[bgc][ovc];` +
        `[ovc]crop=iw:ih*0.2:0:ih*0.8,boxblur=24:2[blurred];` +
        `[bgc][blurred]overlay=0:H*0.8[${outLabel}]`
      );
    default:
      // cover / none — 새 자막이 그 자리를 덮는다.
      return `[${inLabel}]null[${outLabel}]`;
  }
}

export type RenderResult = { videoPath: string; durationSec: number };

export async function renderRemake(opts: {
  sourcePath: string;
  audioPath: string;
  clips: Clip[];
  captions: Caption[];
  style: SubtitleStyle;
  aspectId: string;
  subtitleCleanup: string;
  burnSubtitles: boolean;
  outDir: string;
  fileBase: string;
  durationSec: number;
  onProgress?: (seconds: number) => void;
}): Promise<RenderResult> {
  fs.mkdirSync(opts.outDir, { recursive: true });

  const aspect = getAspect(opts.aspectId);
  const videoPath = path.join(opts.outDir, `${opts.fileBase}.mp4`);

  const filters: string[] = [];
  const concatInputs: string[] = [];

  opts.clips.forEach((clip, i) => {
    filters.push(
      `[0:v]trim=start=${clip.start.toFixed(3)}:end=${clip.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
    );
    concatInputs.push(`[v${i}]`);
  });

  if (opts.clips.length === 1) filters.push(`[v0]null[vcat]`);
  else filters.push(`${concatInputs.join("")}concat=n=${opts.clips.length}:v=1:a=0[vcat]`);

  filters.push(cleanupFilter(opts.subtitleCleanup, "vcat", "vclean"));

  filters.push(
    `[vclean]scale=${aspect.width}:${aspect.height}:force_original_aspect_ratio=increase,` +
      `crop=${aspect.width}:${aspect.height},setsar=1[vscaled]`
  );

  if (opts.burnSubtitles && opts.captions.length > 0) {
    const assPath = path.join(opts.outDir, `${opts.fileBase}.ass`);
    fs.writeFileSync(
      assPath,
      buildAss({
        captions: opts.captions,
        style: opts.style,
        width: aspect.width,
        height: aspect.height,
        fontName: SUBTITLE_FONT,
      }),
      "utf-8"
    );
    // 시스템에 한글 글꼴이 없는 서버에서는 fontsdir 를 줘야 네모로 안 나온다.
    const fontsDir =
      SUBTITLE_FONT_DIR && fs.existsSync(SUBTITLE_FONT_DIR)
        ? `:fontsdir='${escapeFilterPath(SUBTITLE_FONT_DIR)}'`
        : "";
    filters.push(`[vscaled]ass='${escapeFilterPath(assPath)}'${fontsDir}[vout]`);
  } else {
    filters.push(`[vscaled]null[vout]`);
  }

  await run(
    FFMPEG,
    [
      "-y",
      "-i", opts.sourcePath,
      "-i", opts.audioPath,
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      // 오디오는 두 번째 입력(새로 만든 트랙)에서만 가져온다. 원본 소리는 섞이지 않는다.
      "-map", "1:a:0",
      "-c:v", "libx264", "-preset", PRESET, "-crf", CRF,
      "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "160k",
      "-shortest",
      "-movflags", "+faststart",
      videoPath,
    ],
    {
      onStderr: (chunk) => {
        const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(chunk);
        if (m) {
          opts.onProgress?.(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
        }
      },
    }
  );

  return { videoPath, durationSec: opts.durationSec };
}
