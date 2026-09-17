/** 새 자막 만들기 (ASS). 타이밍은 TTS 가 준 문장 시각을 그대로 쓴다. */

import type { SubtitleStyle } from "../src/lib/subtitleStyles";

export type Caption = { start: number; end: number; text: string };

const MAX_SEC = 2.4;

/**
 * 한 줄에 몇 글자까지 넣을 수 있는지 계산한다.
 *
 * 한글은 글자 하나가 거의 한 em 을 차지해서, 글자 수 상한을 고정값으로 두면
 * 글자가 큰 스타일에서 화면 밖으로 넘친다. 화면 너비와 글자 크기로 매번 구한다.
 */
export function captionMaxChars(style: SubtitleStyle, width: number, height: number): number {
  const fontSize = height * style.sizeRatio;
  const usable = width * 0.88; // 좌우 여백
  return Math.max(6, Math.min(20, Math.floor(usable / (fontSize * 0.98))));
}

/**
 * 한 문장이 길면 화면에 다 안 들어간다. 어절 단위로 잘라
 * 글자 수에 비례해 시간을 나눠 준다.
 */
export function splitCue(
  cue: { start: number; end: number; text: string },
  MAX_CHARS = 14
): Caption[] {
  const text = cue.text.replace(/\s+/g, " ").trim();
  const span = cue.end - cue.start;

  if (text.length <= MAX_CHARS && span <= MAX_SEC) {
    return [{ start: cue.start, end: cue.end, text }];
  }

  const words = text.split(" ");
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > MAX_CHARS) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
  const out: Caption[] = [];
  let t = cue.start;

  for (const chunk of chunks) {
    const dur = (chunk.length / totalChars) * span;
    out.push({ start: t, end: Math.min(cue.end, t + dur), text: chunk });
    t += dur;
  }
  return out.filter((c) => c.end - c.start > 0.15);
}

export const buildCaptions = (
  cues: Array<{ start: number; end: number; text: string }>,
  maxChars = 14
): Caption[] => cues.flatMap((cue) => splitCue(cue, maxChars));

/** "0xRRGGBB" 또는 "0xRRGGBB@0.8" → ASS 색상(&HAABBGGRR) */
export function toAssColor(value: string): string {
  const [hexPart, alphaPart] = String(value).split("@");
  const hex = hexPart.replace(/^0x/i, "").padStart(6, "0");
  const [rr, gg, bb] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
  const opacity = alphaPart ? Number.parseFloat(alphaPart) : 1;
  const alpha = Math.round((1 - Math.min(Math.max(opacity, 0), 1)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${bb}${gg}${rr}`.toUpperCase();
}

const assTime = (seconds: number) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
};

const escapeAss = (text: string) =>
  text.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

export function buildAss(opts: {
  captions: Caption[];
  style: SubtitleStyle;
  width: number;
  height: number;
  fontName: string;
}): string {
  const { style: s, width, height } = opts;

  const fontSize = Math.round(height * s.sizeRatio);
  // ASS 의 MarginV 는 아래에서부터 잰다. posY(위에서부터)를 뒤집는다.
  const marginV = Math.round(height * (1 - s.posY));
  const side = Math.round(width * 0.06);

  const style =
    `Style: Cap,${opts.fontName},${fontSize},${toAssColor(s.fontColor)},&H000000FF,` +
    `${toAssColor(s.borderColor)},${s.boxColor ? toAssColor(s.boxColor) : "&HFF000000"},` +
    `1,0,0,0,100,100,0,0,${s.boxColor ? 3 : 1},${s.borderWidth},${s.boxColor ? 0 : 2},2,` +
    `${side},${side},${marginV},1`;

  const events = opts.captions.map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Cap,,0,0,0,,${escapeAss(c.text)}`
  );

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;
}
