/**
 * 구간 고르기.
 *
 * 숏폼(하이라이트 추출)과 무음 제거가 같은 규칙을 씁니다. 둘 다 결국
 * "원본에서 어느 구간을 남길지" 를 정하는 일이고, 남긴 구간 기준으로
 * 자막 시각을 다시 계산해야 한다는 점도 같습니다.
 */

import type { Segment } from "./transcribe";
import { scoreText } from "../src/lib/hookPatterns";

export type Clip = { start: number; end: number };

export type Highlight = {
  /** 원본에서 이 하이라이트가 차지하는 범위 */
  start: number;
  end: number;
  score: number;
  labels: string[];
  /** 앞 3초에 오도록 잡은 앵커 문장 */
  title: string;
  segments: Segment[];
};

/** 출력 타임라인 기준 자막 한 줄 */
export type TimedCue = { start: number; end: number; text: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 목록에서 한 줄로 보이는 제목. 첫 문장만, 너무 길면 줄인다. */
function shortTitle(text: string): string {
  const first = text.trim().split(/(?<=[.!?…])\s+/)[0] ?? text.trim();
  return first.length > 34 ? `${first.slice(0, 34)}…` : first;
}

/**
 * 말 단위 목록.
 *
 * 받아 적기가 주는 "문장"은 생각보다 깁니다 — 실제로 58초짜리 영상이 25초·30초짜리
 * 문장 두 개로 나오기도 합니다. 그 단위로 빈 구간을 찾으면 잘라낼 게 없다고 나오고,
 * 자막도 25초 동안 한 줄이 떠 있게 됩니다. 그래서 단어 시각이 있으면 단어를 씁니다.
 */
export function speechUnits(segments: Segment[]): TimedCue[] {
  const units: TimedCue[] = [];

  for (const seg of segments) {
    const words = (seg.words ?? []).filter((w) => w.word.trim() && w.end > w.start);
    if (words.length > 0) {
      for (const word of words) units.push({ start: word.start, end: word.end, text: word.word.trim() });
    } else if (seg.text.trim()) {
      units.push({ start: seg.start, end: seg.end, text: seg.text.trim() });
    }
  }

  return units.sort((a, b) => a.start - b.start);
}

/**
 * 말이 끊긴 구간을 걷어낸 clip 목록.
 *
 * 말과 말 사이 공백이 thresholdSec 를 넘으면 잘라냅니다. 앞뒤로 padSec 만큼
 * 여유를 두어야 첫 음절이 잘리지 않습니다.
 */
export function speechClips(
  segments: Segment[],
  opts: { thresholdSec: number; padSec: number; limitStart?: number; limitEnd?: number }
): Clip[] {
  const from = opts.limitStart ?? 0;
  const to = opts.limitEnd ?? Number.POSITIVE_INFINITY;

  const clips: Clip[] = [];
  for (const unit of speechUnits(segments)) {
    if (unit.end <= from || unit.start >= to) continue;

    const start = clamp(Math.max(unit.start, from) - opts.padSec, from, to);
    const end = clamp(Math.min(unit.end, to) + opts.padSec, from, to);
    if (end - start < 0.05) continue;

    const last = clips[clips.length - 1];
    // 공백이 기준보다 짧으면 굳이 자르지 않는다 — 자를수록 말이 툭툭 끊긴다.
    if (last && start - last.end <= opts.thresholdSec) last.end = Math.max(last.end, end);
    else clips.push({ start, end });
  }
  return clips;
}

/**
 * 자막 한 줄 단위로 묶는다.
 *
 * 단어를 글자 수 상한까지 이어 붙이되, 쉼이 길면 거기서 끊습니다.
 * 문장만 있고 단어 시각이 없으면 문장을 그대로 한 줄로 씁니다.
 */
export function groupCues(
  segments: Segment[],
  opts: { maxChars: number; maxSec?: number; gapSec?: number }
): TimedCue[] {
  const maxSec = opts.maxSec ?? 4.5;
  const gapSec = opts.gapSec ?? 0.5;

  const cues: TimedCue[] = [];
  for (const unit of speechUnits(segments)) {
    const last = cues[cues.length - 1];
    const joined = last ? `${last.text} ${unit.text}`.trim() : unit.text;

    if (
      last &&
      joined.length <= opts.maxChars &&
      unit.end - last.start <= maxSec &&
      unit.start - last.end <= gapSec
    ) {
      last.text = joined;
      last.end = unit.end;
    } else {
      cues.push({ ...unit });
    }
  }

  return cues.filter((c) => c.end > c.start && c.text.length > 0);
}

/** 남긴 구간 기준으로 자막 시각을 다시 계산한다. */
export function retimeCues(sourceCues: TimedCue[], clips: Clip[]): TimedCue[] {
  const cues: TimedCue[] = [];

  for (const seg of sourceCues) {
    const text = seg.text.trim();
    if (!text) continue;

    // 이 문장이 어느 clip 안에 들어 있는지 찾으면서, 그 앞까지의 출력 시각을 더한다.
    let offset = 0;
    for (const clip of clips) {
      const length = clip.end - clip.start;
      const overlapStart = Math.max(seg.start, clip.start);
      const overlapEnd = Math.min(seg.end, clip.end);

      if (overlapEnd - overlapStart > 0.05) {
        const start = offset + (overlapStart - clip.start);
        const end = offset + (overlapEnd - clip.start);
        const last = cues[cues.length - 1];
        // 문장이 잘린 clip 두 개에 걸치면 한 줄로 잇는다.
        if (last && last.text === text && start - last.end < 0.4) last.end = end;
        else cues.push({ start, end, text });
        break;
      }
      offset += length;
    }
  }

  return cues.filter((c) => c.end > c.start);
}

export const totalLength = (clips: Clip[]) => clips.reduce((sum, c) => sum + (c.end - c.start), 0);

/**
 * 너무 긴 문장을 쪼갠다.
 *
 * 받아 적기가 58초짜리를 25초·30초 두 덩어리로 주는 일이 흔합니다. 그대로 두면
 * 하이라이트가 "영상의 앞 절반" 같은 식으로만 잡힙니다. 단어 시각이 있으면
 * 종결부호와 긴 쉼을 기준으로 문장 단위로 다시 나눕니다.
 */
export function splitLongSegments(segments: Segment[], maxSec = 12): Segment[] {
  const out: Segment[] = [];

  for (const seg of segments) {
    const words = (seg.words ?? []).filter((w) => w.word.trim() && w.end > w.start);
    if (seg.end - seg.start <= maxSec || words.length < 4) {
      out.push(seg);
      continue;
    }

    let bucket: typeof words = [];
    const flush = () => {
      if (bucket.length === 0) return;
      out.push({
        start: bucket[0].start,
        end: bucket[bucket.length - 1].end,
        text: bucket.map((w) => w.word.trim()).join(" ").replace(/\s+([.,!?])/g, "$1"),
        words: bucket,
      });
      bucket = [];
    };

    for (let i = 0; i < words.length; i++) {
      bucket.push(words[i]);
      const next = words[i + 1];
      const ended = /[.!?…]$/.test(words[i].word.trim());
      const pause = next ? next.start - words[i].end : 0;
      const length = words[i].end - bucket[0].start;

      if ((ended && length >= 2.5) || pause > 0.7 || length >= maxSec) flush();
    }
    flush();
  }

  return out;
}

/**
 * 하이라이트 고르기.
 *
 * 점수가 가장 높은 문장을 앵커로 잡고, 그 문장이 결과물 앞쪽 3초 안에 오도록
 * 앞뒤 문장을 붙여 minSec~maxSec 를 채웁니다. 이미 고른 구간과 겹치면 버립니다.
 */
export function pickHighlights(
  segments: Segment[],
  opts: { count: number; minSec: number; maxSec: number }
): Highlight[] {
  const scored = segments
    .map((seg) => ({ seg, ...scoreText(seg.text, seg.end - seg.start) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    throw new Error("쓸 만한 구간을 찾지 못했습니다. 말소리가 또렷한 영상인지 확인해 주세요.");
  }

  const picked: Highlight[] = [];

  for (const anchor of scored) {
    if (picked.length >= opts.count) break;

    const index = segments.indexOf(anchor.seg);
    // 앵커가 결과물 앞 3초 안에 들어오도록 앞쪽은 조금만 붙인다.
    let first = index;
    let last = index;
    let lead = 0;

    while (first > 0 && lead + (anchor.seg.start - segments[first - 1].start) <= 3) {
      first -= 1;
      lead = anchor.seg.start - segments[first].start;
    }

    while (
      last < segments.length - 1 &&
      segments[last].end - segments[first].start < opts.minSec
    ) {
      last += 1;
    }

    // 최대 길이를 넘기면 뒤에서부터 줄인다.
    while (last > index && segments[last].end - segments[first].start > opts.maxSec) {
      last -= 1;
    }

    const start = segments[first].start;
    const end = segments[last].end;
    const length = end - start;
    if (length < Math.min(opts.minSec, 8)) continue;

    // 이미 고른 것과 3분의 1 넘게 겹치면 같은 내용을 두 번 내보내는 셈이다.
    const overlaps = picked.some(
      (p) => Math.min(p.end, end) - Math.max(p.start, start) > Math.min(length, p.end - p.start) * 0.35
    );
    if (overlaps) continue;

    picked.push({
      start,
      end,
      score: Number(anchor.score.toFixed(2)),
      labels: anchor.labels,
      title: shortTitle(anchor.seg.text),
      segments: segments.slice(first, last + 1),
    });
  }

  if (picked.length === 0) {
    throw new Error("조건에 맞는 구간을 만들지 못했습니다. 길이 설정을 조금 늘려 보세요.");
  }

  // 원본 순서대로 되돌려 번호를 매긴다.
  return picked.sort((a, b) => a.start - b.start);
}

/** count=0(자동)일 때 영상 길이로 개수를 정한다. */
export function autoCount(durationSec: number): number {
  return clamp(Math.floor(durationSec / 120), 1, 5);
}
