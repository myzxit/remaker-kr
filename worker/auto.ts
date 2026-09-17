/**
 * 자동 맞춤.
 *
 * 링크나 파일 하나만 올렸을 때, 원본을 보고 나머지를 정합니다.
 * 고르는 근거를 전부 남겨 두었다가 작업 화면에 보여 줍니다 — 자동이라도
 * 무엇이 왜 그렇게 정해졌는지는 보여야 합니다.
 */

import { MIN_TARGET_SEC, MAX_TARGET_SEC, LANGUAGES } from "../src/lib/tools";
import { defaultVoice } from "../src/lib/voices";

export type AutoLanguage = (typeof LANGUAGES)[number]["id"];

export type AutoPlan = {
  targetSec: number;
  language: AutoLanguage;
  voice: string;
  aspect: "16:9" | "9:16" | "1:1";
  scriptMode: "condense" | "faithful";
  /** 화면에 보여 줄 근거 */
  reasons: string[];
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** 원본 화면 방향을 그대로 따라간다. 세로 영상을 가로로 잘라내면 인물이 날아간다. */
export function pickAspect(width: number, height: number): AutoPlan["aspect"] {
  const ratio = width / height;
  if (ratio < 0.85) return "9:16";
  if (ratio < 1.15) return "1:1";
  return "16:9";
}

/**
 * 결과 길이.
 *
 * 원본의 60% 정도로 줄이면 늘어지는 구간이 걷히면서 내용은 남습니다.
 * 짧은 영상은 줄일 게 없으니 원본 길이를 그대로 목표로 잡습니다.
 * 어느 쪽이든 1분~28분 안으로 맞춥니다.
 */
export function pickTargetSec(sourceSec: number): number {
  const target = sourceSec <= 150 ? sourceSec : sourceSec * 0.6;
  return Math.round(clamp(target, MIN_TARGET_SEC, MAX_TARGET_SEC));
}

const languageLabel = (id: string) => LANGUAGES.find((l) => l.id === id)?.label ?? id;

export function buildAutoPlan(input: {
  sourceSec: number;
  width: number;
  height: number;
  /** 받아 적기가 알아낸 언어 */
  detectedLanguage?: string;
  /** 사용자가 길이는 직접 골랐다면 그 값 */
  fixedTargetSec?: number;
}): AutoPlan {
  const reasons: string[] = [];

  const aspect = pickAspect(input.width, input.height);
  reasons.push(`원본이 ${input.width}×${input.height} 라서 ${aspect} 로 맞췄습니다.`);

  const supported = LANGUAGES.some((l) => l.id === input.detectedLanguage);
  const language: AutoLanguage = supported ? (input.detectedLanguage as AutoLanguage) : "ko";
  reasons.push(
    supported
      ? `원본에서 ${languageLabel(language)}로 들려 같은 언어로 읽습니다.`
      : "원본 언어를 확실히 알 수 없어 한국어로 읽습니다."
  );

  const targetSec = input.fixedTargetSec ?? pickTargetSec(input.sourceSec);
  if (input.fixedTargetSec) {
    reasons.push(`길이는 직접 고르신 ${Math.round(targetSec / 60)}분에 맞춥니다.`);
  } else if (input.sourceSec <= 150) {
    reasons.push("원본이 짧아 줄이지 않고 그대로 다시 구성합니다.");
  } else {
    reasons.push(
      `원본 ${Math.round(input.sourceSec / 60)}분을 약 ${Math.round(targetSec / 60)}분으로 추립니다.`
    );
  }

  // 짧은 영상을 더 추리면 남는 게 없다. 순서대로 읽는 편이 낫다.
  const scriptMode: AutoPlan["scriptMode"] = input.sourceSec <= 150 ? "faithful" : "condense";

  return { targetSec, language, voice: defaultVoice(language), aspect, scriptMode, reasons };
}
