/**
 * 새 목소리 만들기.
 *
 * Microsoft Edge 의 읽어주기(edge-tts)를 씁니다. API 키가 없고 무료입니다.
 *
 * 문장마다 따로 부르지 않고 대본 전체를 한 번에 읽힙니다. edge-tts 가 만들어 주는
 * 자막(SRT)에 문장별 시각이 들어 있어서, 그 값을 그대로 쓰면 새 자막 싱크를
 * 추정하지 않아도 됩니다.
 */

import fs from "node:fs";
import path from "node:path";
import { run, FFMPEG, probeDuration } from "./ffmpeg";

const EDGE_TTS = process.env.EDGE_TTS_PATH || "edge-tts";

export type Cue = { index: number; start: number; end: number; text: string };

export type Narration = {
  audioPath: string;
  /** 새 오디오 타임라인 기준 문장별 시각 */
  cues: Cue[];
  durationSec: number;
};

/** "00:00:04,137" → 4.137 */
function parseSrtTime(value: string): number {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(value.trim());
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export function parseSrt(content: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = content.replace(/\r/g, "").trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;

    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;

    const [from, to] = timeLine.split("-->");
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(" ").trim();
    if (!text) continue;

    cues.push({
      index: cues.length,
      start: parseSrtTime(from),
      end: parseSrtTime(to),
      text,
    });
  }

  // edge-tts 가 가끔 다음 자막보다 끝시각을 늦게 적는다. 겹치면 앞을 줄인다.
  for (let i = 1; i < cues.length; i++) {
    if (cues[i - 1].end > cues[i].start) cues[i - 1].end = cues[i].start;
  }
  return cues.filter((c) => c.end > c.start);
}

/**
 * 대본을 읽어 음성 파일과 문장별 시각을 만든다.
 * @param rate 말 속도 (-50 ~ +50, 퍼센트)
 */
export async function synthesize(opts: {
  sentences: string[];
  voice: string;
  rate: number;
  workDir: string;
  fileBase?: string;
}): Promise<Narration> {
  fs.mkdirSync(opts.workDir, { recursive: true });

  const base = opts.fileBase ?? "narration";
  const textPath = path.join(opts.workDir, `${base}.txt`);
  const audioPath = path.join(opts.workDir, `${base}.mp3`);
  const srtPath = path.join(opts.workDir, `${base}.srt`);

  // 한 줄에 한 문장씩 넣어야 edge-tts 가 문장 경계를 그대로 잡는다.
  const text = opts.sentences.map((s) => s.trim()).filter(Boolean).join("\n");
  if (!text) throw new Error("읽을 대본이 비어 있습니다.");
  fs.writeFileSync(textPath, text, "utf-8");

  const rate = `${opts.rate >= 0 ? "+" : ""}${Math.round(opts.rate)}%`;

  await run(EDGE_TTS, [
    "--file", textPath,
    "--voice", opts.voice,
    "--rate", rate,
    "--write-media", audioPath,
    "--write-subtitles", srtPath,
  ]);

  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size === 0) {
    throw new Error("목소리를 만들지 못했습니다. 인터넷 연결과 edge-tts 설치를 확인하세요.");
  }

  const cues = fs.existsSync(srtPath) ? parseSrt(fs.readFileSync(srtPath, "utf-8")) : [];
  if (cues.length === 0) {
    throw new Error("목소리 자막(타이밍)을 읽지 못했습니다.");
  }

  return { audioPath, cues, durationSec: cues[cues.length - 1].end };
}

/** 한국어 기준 대략적인 낭독 길이(초). 대본을 목표 길이에 맞출 때 쓰는 어림값. */
export function estimateSeconds(text: string, rate = 0): number {
  const chars = text.replace(/\s/g, "").length;
  const base = chars / 5.2; // 초당 5.2자 남짓
  return base / (1 + rate / 100);
}

// ─── 파일에서 떠낸 목소리로 읽기 (음성 복제) ────────────────────────────────

const PYTHON = process.env.PYTHON_PATH || "python3";

/** 문장 사이 간격. 복제 엔진은 문장별로 따로 만들기 때문에 직접 넣어 준다. */
const CLONE_GAP_SEC = 0.32;

export type CloneVoice = {
  /** 참고 음성 wav 의 절대 경로 */
  samplePath: string;
  language: string;
  engine: string;
};

/**
 * 복제한 목소리로 대본을 읽는다.
 *
 * edge-tts 와 달리 타임코드를 주지 않으므로, 문장마다 따로 만들고 길이를 재서
 * 타임라인을 직접 세운다. 그 뒤 과정(자막·화면 배정)은 edge 경로와 완전히 같다.
 */
export async function synthesizeCloned(opts: {
  sentences: string[];
  voice: CloneVoice;
  workDir: string;
  fileBase?: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<Narration> {
  const base = opts.fileBase ?? "narration";
  const partsDir = path.join(opts.workDir, `${base}-parts`);
  fs.mkdirSync(partsDir, { recursive: true });

  const sentences = opts.sentences.map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) throw new Error("읽을 대본이 비어 있습니다.");

  const sentencesPath = path.join(opts.workDir, `${base}-sentences.json`);
  const resultPath = path.join(opts.workDir, `${base}-parts.json`);
  fs.writeFileSync(sentencesPath, JSON.stringify(sentences), "utf-8");

  await run(
    PYTHON,
    [
      path.join(process.cwd(), "worker", "clone_tts.py"),
      "--sentences", sentencesPath,
      "--speaker", opts.voice.samplePath,
      "--language", opts.voice.language,
      "--outdir", partsDir,
      "--out", resultPath,
    ],
    {
      onStderr: (chunk) => {
        const m = /progress (\d+)\/(\d+)/.exec(chunk);
        if (m) opts.onProgress?.(Number(m[1]), Number(m[2]));
      },
    }
  );

  const parts = (JSON.parse(fs.readFileSync(resultPath, "utf-8")).files ?? []) as Array<{
    index: number;
    path: string;
    seconds: number;
  }>;
  if (parts.length === 0) throw new Error("복제한 목소리로 만들어진 음성이 없습니다.");

  // 복제 엔진은 조각 앞뒤에 빈 구간을 남기고, 중간에도 길게 쉰다.
  // 그대로 두면 타임라인이 늘어져 화면이 붕 뜬다. 다듬고 길이를 다시 잰다.
  for (const part of parts) {
    const trimmed = part.path.replace(/\.wav$/, "-trim.wav");
    await run(FFMPEG, [
      "-y", "-i", part.path,
      "-af",
      "silenceremove=start_periods=1:start_silence=0.15:start_threshold=-45dB:" +
        "stop_periods=-1:stop_duration=0.35:stop_threshold=-45dB",
      "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le",
      trimmed,
    ]);
    part.path = trimmed;
    part.seconds = await probeDuration(trimmed);
  }

  // 문장 사이에 끼울 무음을 한 번 만들어 재사용한다.
  const silencePath = path.join(partsDir, "gap.wav");
  await run(FFMPEG, [
    "-y",
    "-f", "lavfi",
    "-i", `anullsrc=r=24000:cl=mono:d=${CLONE_GAP_SEC}`,
    "-c:a", "pcm_s16le",
    silencePath,
  ]);

  // concat 데모서는 형식이 같아야 한다. 복제 결과와 무음 모두 24kHz 모노 wav.
  const listPath = path.join(partsDir, "list.txt");
  const escape = (p: string) => p.replace(/'/g, "'\\''");
  const lines: string[] = [];
  parts.forEach((part, i) => {
    if (i > 0) lines.push(`file '${escape(silencePath)}'`);
    lines.push(`file '${escape(part.path)}'`);
  });
  fs.writeFileSync(listPath, lines.join("\n"), "utf-8");

  const audioPath = path.join(opts.workDir, `${base}.wav`);
  await run(FFMPEG, [
    "-y", "-f", "concat", "-safe", "0", "-i", listPath,
    "-c:a", "pcm_s16le", "-ar", "24000", "-ac", "1",
    audioPath,
  ]);

  // 타임라인 세우기 — 이어 붙인 순서 그대로 누적한다.
  const cues: Cue[] = [];
  let cursor = 0;
  parts.forEach((part, i) => {
    const text = sentences[part.index] ?? sentences[i] ?? "";
    cues.push({
      index: i,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + part.seconds).toFixed(3)),
      text,
    });
    cursor += part.seconds + CLONE_GAP_SEC;
  });

  return {
    audioPath,
    cues,
    durationSec: Number(Math.max(0, cursor - CLONE_GAP_SEC).toFixed(3)),
  };
}
