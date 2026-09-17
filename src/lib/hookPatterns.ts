/**
 * 훅 표현 사전 + 문장 점수 계산.
 * 워커의 하이라이트 선정(worker/highlights.ts)과 무료 도구 페이지가 같은 규칙을 쓴다.
 */

export type HookPattern = { re: RegExp; weight: number; label: string };

export const HOOK_PATTERNS: HookPattern[] = [
  { re: /(왜|어떻게|무엇|뭐가|어디서|누가)/, weight: 2.2, label: "질문형 도입" },
  { re: /[?？]/, weight: 1.8, label: "질문 문장" },
  { re: /(사실|비결|핵심|결론|정답|이유는|포인트)/, weight: 2.4, label: "핵심 정리" },
  { re: /(절대|반드시|무조건|진짜|정말|완전|대박|충격)/, weight: 1.6, label: "강조 표현" },
  { re: /(처음|마지막|최초|유일|최고|최악)/, weight: 1.5, label: "최상급 표현" },
  {
    re: /\d+(\.\d+)?\s*(개|번|년|월|일|시간|분|초|원|만원|억|퍼센트|%|배)/,
    weight: 1.7,
    label: "구체적 수치",
  },
  { re: /(하지만|그런데|반전|알고 보니|사실은)/, weight: 1.4, label: "전환 지점" },
  { re: /[!！]/, weight: 1.0, label: "감탄 문장" },
];

export const MIN_SEGMENT_CHARS = 6;

export type TextScore = { score: number; labels: string[]; density: number };

/**
 * 문장 하나의 매력도 점수.
 * durationSec 를 주면 말의 밀도(초당 글자 수)까지 반영한다.
 * 도구 페이지처럼 길이를 모를 때는 한국어 평균 낭독 속도(초당 5자)로 가정한다.
 */
export function scoreText(text: string, durationSec?: number): TextScore {
  const clean = text.trim();
  if (clean.length < MIN_SEGMENT_CHARS) return { score: 0, labels: [], density: 0 };

  const duration = Math.max(0.5, durationSec ?? clean.length / 5);
  const density = clean.length / duration;

  let score = Math.min(density, 12) * 0.45;
  const labels: string[] = [];

  for (const { re, weight, label } of HOOK_PATTERNS) {
    if (re.test(clean)) {
      score += weight;
      labels.push(label);
    }
  }

  if (/[.!?。…]$/.test(clean)) score += 0.8;

  return { score, labels, density };
}
