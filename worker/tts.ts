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
import { run } from "./ffmpeg";

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
