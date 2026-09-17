/**
 * 대본 재구성.
 *
 * 원본 음성 인식 결과를 받아, 목표 길이에 맞는 새 대본을 만든다.
 * 각 문장은 "원본 어느 구간에서 나왔는지"를 들고 다닌다 — 나중에 화면을 붙일 때 쓴다.
 */

import type { Segment } from "./transcribe";
import { scoreText } from "../src/lib/hookPatterns";
import { estimateSeconds } from "./tts";

export type ScriptLine = {
  index: number;
  text: string;
  /** 원본에서 이 문장이 나온 구간 */
  srcStart: number;
  srcEnd: number;
  score: number;
};

export type BuiltScript = {
  lines: ScriptLine[];
  /** 예상 낭독 길이(초) */
  estimatedSec: number;
  mode: "condense" | "faithful";
};

/** 인식 결과에서 자주 나오는 군더더기. 새로 읽을 때는 빼는 편이 깔끔하다. */
const FILLERS = /(^|\s)(음+|어+|그+니까|뭐지|아니 그|자 그럼)(\s|,|\.|$)/g;

function tidy(text: string): string {
  return text
    .replace(FILLERS, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/** 문장이 종결부호로 끝나지 않으면 붙여 준다. TTS 억양이 자연스러워진다. */
function finish(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

export function buildScript(
  segments: Segment[],
  opts: { targetSec: number; mode: "condense" | "faithful"; rate: number }
): BuiltScript {
  const candidates = segments
    .map((seg, i) => {
      const text = finish(tidy(seg.text));
      return {
        index: i,
        text,
        srcStart: seg.start,
        srcEnd: seg.end,
        score: scoreText(text, seg.end - seg.start).score,
        estimate: estimateSeconds(text, opts.rate),
      };
    })
    .filter((c) => c.text.replace(/[.!?]/g, "").trim().length >= 4);

  if (candidates.length === 0) {
    throw new Error("대본으로 쓸 만한 문장을 찾지 못했습니다. 말소리가 있는 영상인지 확인해 주세요.");
  }

  // 목표 길이를 채울 때까지 고른다.
  // condense: 점수 높은 순으로 고른 뒤 시간순으로 되돌린다(내용이 뒤죽박죽 되지 않게).
  // faithful: 앞에서부터 순서대로.
  const pool =
    opts.mode === "condense"
      ? [...candidates].sort((a, b) => b.score - a.score)
      : candidates;

  const picked: typeof candidates = [];
  let total = 0;

  for (const cand of pool) {
    if (total >= opts.targetSec) break;
    picked.push(cand);
    total += cand.estimate + 0.35; // 문장 사이 숨 쉬는 간격
  }

  picked.sort((a, b) => a.srcStart - b.srcStart);

  return {
    lines: picked.map((p, i) => ({
      index: i,
      text: p.text,
      srcStart: p.srcStart,
      srcEnd: p.srcEnd,
      score: Number(p.score.toFixed(3)),
    })),
    estimatedSec: Number(total.toFixed(1)),
    mode: opts.mode,
  };
}

/**
 * 나레이션 길이에 맞춰 원본 영상 구간을 배정한다.
 *
 * 원본을 앞에서부터 순서대로 소비하면서, 각 문장이 필요로 하는 길이만큼 가져다 쓴다.
 * 이렇게 하면 영상이 항상 정상 속도로 재생되고(빨리감기 없음), 나레이션과 길이가 정확히 맞는다.
 * 원본이 모자라면 처음으로 돌아가 다시 쓴다.
 */
export function assignClips(
  cues: { start: number; end: number }[],
  lines: ScriptLine[],
  sourceDuration: number
): Array<{ start: number; end: number }> {
  const clips: Array<{ start: number; end: number }> = [];
  const usable = Math.max(1, sourceDuration - 0.2);
  let cursor = 0;

  for (let i = 0; i < cues.length; i++) {
    const needed = Math.max(0.4, cues[i].end - cues[i].start);
    // 대응하는 문장이 있으면 그 지점 근처에서 시작한다(내용과 화면이 맞도록).
    const line = lines[i];
    if (line && line.srcStart >= cursor && line.srcStart < usable) {
      cursor = Math.max(0, line.srcStart - 0.25);
    }

    let remaining = needed;
    while (remaining > 0.05) {
      if (cursor >= usable) cursor = 0; // 원본이 모자라면 처음부터 다시
      const take = Math.min(remaining, usable - cursor);
      clips.push({ start: Number(cursor.toFixed(3)), end: Number((cursor + take).toFixed(3)) });
      cursor += take;
      remaining -= take;
    }
  }

  // 붙어 있는 구간은 하나로 합친다. ffmpeg 필터가 짧아진다.
  const merged: Array<{ start: number; end: number }> = [];
  for (const clip of clips) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(clip.start - last.end) < 0.02) last.end = clip.end;
    else merged.push({ ...clip });
  }
  return merged;
}
