/**
 * 잘라 붙이기 렌더러.
 *
 * 재구성(remake.ts)과 달리 **원본 소리를 그대로 가져옵니다.** 숏폼과 무음 제거는
 * 원본의 말소리가 결과물의 알맹이라서, 영상과 소리를 같은 구간으로 잘라 붙입니다.
 * 중간 파일 없이 filter_complex 한 번으로 끝냅니다.
 */

import fs from "node:fs";
import path from "node:path";
import { run, FFMPEG, escapeFilterPath } from "./ffmpeg";
import { buildAss, type Caption } from "./subtitles";
import type { SubtitleStyle } from "../src/lib/subtitleStyles";
import { ASPECTS } from "../src/lib/tools";
import type { Clip } from "./highlights";

const PRESET = process.env.FFMPEG_PRESET || "veryfast";
const CRF = process.env.FFMPEG_CRF || "21";
const SUBTITLE_FONT = process.env.SUBTITLE_FONT || "NanumGothic";
const SUBTITLE_FONT_DIR = process.env.SUBTITLE_FONT_DIR || "";

/** 한 번에 넘길 수 있는 구간 수. 너무 많으면 필터 그래프가 감당하지 못한다. */
const MAX_CLIPS = 120;

export async function renderCuts(opts: {
  sourcePath: string;
  clips: Clip[];
  captions: Caption[];
  style: SubtitleStyle;
  /** 비워 두면 원본 해상도를 유지한다 (무음 제거) */
  aspectId?: string;
  burnSubtitles: boolean;
  outDir: string;
  fileBase: string;
  onProgress?: (seconds: number) => void;
}): Promise<{ videoPath: string; durationSec: number }> {
  fs.mkdirSync(opts.outDir, { recursive: true });

  const clips = opts.clips.slice(0, MAX_CLIPS);
  if (clips.length === 0) throw new Error("남길 구간이 없습니다.");

  const videoPath = path.join(opts.outDir, `${opts.fileBase}.mp4`);
  const filters: string[] = [];
  const concatInputs: string[] = [];

  clips.forEach((clip, i) => {
    const from = clip.start.toFixed(3);
    const to = clip.end.toFixed(3);
    filters.push(`[0:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[0:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS[a${i}]`);
    concatInputs.push(`[v${i}][a${i}]`);
  });

  if (clips.length === 1) {
    filters.push(`[v0]null[vcat]`, `[a0]anull[aout]`);
  } else {
    filters.push(`${concatInputs.join("")}concat=n=${clips.length}:v=1:a=1[vcat][aout]`);
  }

  const aspect = opts.aspectId ? ASPECTS.find((a) => a.id === opts.aspectId) : undefined;
  if (aspect) {
    filters.push(
      `[vcat]scale=${aspect.width}:${aspect.height}:force_original_aspect_ratio=increase,` +
        `crop=${aspect.width}:${aspect.height},setsar=1[vscaled]`
    );
  } else {
    // 원본 해상도 유지. 홀수 크기는 libx264 가 거부하므로 짝수로 맞춘다.
    filters.push(`[vcat]scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1[vscaled]`);
  }

  if (opts.burnSubtitles && opts.captions.length > 0) {
    const assPath = path.join(opts.outDir, `${opts.fileBase}.ass`);
    fs.writeFileSync(
      assPath,
      buildAss({
        captions: opts.captions,
        style: opts.style,
        width: aspect?.width ?? 1920,
        height: aspect?.height ?? 1080,
        fontName: SUBTITLE_FONT,
      }),
      "utf-8"
    );
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
      "-filter_complex", filters.join(";"),
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264", "-preset", PRESET, "-crf", CRF,
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k",
      "-movflags", "+faststart",
      videoPath,
    ],
    {
      onStderr: (chunk) => {
        const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(chunk);
        if (m) opts.onProgress?.(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
      },
    }
  );

  const durationSec = clips.reduce((sum, c) => sum + (c.end - c.start), 0);
  return { videoPath, durationSec };
}
