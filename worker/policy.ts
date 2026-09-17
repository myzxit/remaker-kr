/**
 * 정책 사전 점검.
 *
 * 받아 적은 말과 영상의 형식을 훑어, 올리기 전에 한 번 더 볼 만한 지점을 짚어 줍니다.
 * **판정이 아닙니다.** 플랫폼의 실제 심사 기준은 공개되어 있지 않고 수시로 바뀝니다.
 * 여기서 걸리지 않았다고 안전한 것도, 걸렸다고 반드시 문제가 되는 것도 아닙니다.
 */

import type { Transcript } from "./transcribe";

export type Severity = "high" | "medium" | "low";

export type Finding = {
  severity: Severity;
  category: string;
  message: string;
  /** 근거가 된 문장 (있을 때만) */
  quote?: string;
  atSec?: number;
};

export type PolicyReport = {
  score: number;
  summary: string;
  findings: Finding[];
  stats: {
    durationSec: number;
    speechSec: number;
    speechRatio: number;
    charCount: number;
    charsPerSec: number;
    meanVolumeDb: number | null;
    maxVolumeDb: number | null;
  };
};

type Rule = { re: RegExp; severity: Severity; category: string; message: string };

/**
 * 표현 규칙.
 *
 * 수익화에서 자주 문제되는 범주만 담았습니다. 한국어 표현 기준이고,
 * 맥락을 보지 않으므로 인용·반어도 똑같이 걸립니다.
 */
const RULES: Rule[] = [
  {
    re: /(씨발|시발|좆|병신|새끼|개새|미친놈|지랄)/,
    severity: "high",
    category: "욕설",
    message: "욕설이 들어 있습니다. 광고주 친화적이지 않은 콘텐츠로 분류될 수 있습니다.",
  },
  {
    re: /(자살|목숨을 끊|극단적 선택|자해)/,
    severity: "high",
    category: "민감 주제",
    message: "자살·자해 관련 표현입니다. 다루더라도 예방 정보와 상담 창구를 함께 넣는 편이 안전합니다.",
  },
  {
    re: /(총기|폭탄|테러|살해|흉기)/,
    severity: "high",
    category: "폭력",
    message: "폭력·무기 관련 표현입니다. 묘사가 구체적이면 연령 제한이 걸릴 수 있습니다.",
  },
  {
    re: /(도박|배팅|토토|카지노|먹튀)/,
    severity: "high",
    category: "도박",
    message: "도박 관련 표현입니다. 다수 플랫폼에서 광고가 제한되는 범주입니다.",
  },
  {
    re: /(원금\s*보장|무조건\s*수익|확정\s*수익|하루\s*\d+만원|월\s*\d{3,}만원\s*보장)/,
    severity: "high",
    category: "과장된 수익 약속",
    message: "수익을 보장하는 표현입니다. 금융·투자 관련 규제와 사기 신고 대상이 될 수 있습니다.",
  },
  {
    re: /(암|당뇨|고혈압)[^.]{0,12}(완치|낫는다|치료된다|고친다)/,
    severity: "high",
    category: "의학적 단정",
    message: "질병을 고친다는 단정입니다. 의료·건강 정보는 근거와 출처를 함께 밝히는 편이 안전합니다.",
  },
  {
    re: /(협찬|광고|유료광고|제품을\s*제공받)/,
    severity: "low",
    category: "광고 표기",
    message: "협찬·광고 언급이 있습니다. 유료 광고 표시를 켰는지 확인하세요.",
  },
  {
    re: /(담배|흡연|전자담배|주류|소주|맥주|위스키)/,
    severity: "medium",
    category: "주류·담배",
    message: "주류·담배 언급입니다. 연령 제한이나 광고 제한이 붙을 수 있습니다.",
  },
  {
    re: /(성인|야한|섹스|음란)/,
    severity: "medium",
    category: "선정성",
    message: "선정적 표현입니다. 표현 강도에 따라 연령 제한이 걸릴 수 있습니다.",
  },
  {
    re: /(구독\s*안\s*하면|좋아요\s*안\s*누르면|댓글\s*안\s*달면)/,
    severity: "medium",
    category: "참여 유도",
    message: "구독·좋아요를 조건으로 거는 표현입니다. 과하면 스팸 정책에 걸립니다.",
  },
  {
    re: /(무단\s*전재|퍼온|그대로\s*가져)/,
    severity: "medium",
    category: "재사용 신호",
    message: "다른 곳의 콘텐츠를 그대로 가져왔다는 언급입니다. 재사용 콘텐츠 정책을 확인하세요.",
  },
];

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 18, medium: 8, low: 3 };

export function analyzeTranscript(
  transcript: Transcript,
  stats: { durationSec: number; meanVolumeDb: number | null; maxVolumeDb: number | null }
): PolicyReport {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const seg of transcript.segments) {
    const text = seg.text.trim();
    if (!text) continue;

    for (const rule of RULES) {
      if (!rule.re.test(text)) continue;
      // 같은 범주는 한 번만 — 같은 지적이 수십 개 쌓이면 읽히지 않는다.
      if (seen.has(rule.category)) continue;
      seen.add(rule.category);

      findings.push({
        severity: rule.severity,
        category: rule.category,
        message: rule.message,
        quote: text.slice(0, 80),
        atSec: Math.round(seg.start),
      });
    }
  }

  const charCount = transcript.segments.reduce((sum, s) => sum + s.text.replace(/\s/g, "").length, 0);
  const speechSec = transcript.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const durationSec = stats.durationSec || transcript.duration || speechSec;
  const speechRatio = durationSec > 0 ? speechSec / durationSec : 0;
  const charsPerSec = speechSec > 0 ? charCount / speechSec : 0;

  // ── 형식 점검 ──────────────────────────────────────────────────────────
  if (durationSec < 60) {
    findings.push({
      severity: "low",
      category: "길이",
      message: "1분 미만입니다. 숏폼으로는 괜찮지만, 일반 영상 수익화 기준에는 못 미칠 수 있습니다.",
    });
  }

  if (speechRatio < 0.35 && durationSec > 60) {
    findings.push({
      severity: "medium",
      category: "재사용 신호",
      message: `말소리가 전체의 ${Math.round(speechRatio * 100)}% 뿐입니다. 해설이 적으면 재사용 콘텐츠로 볼 여지가 커집니다.`,
    });
  }

  if (charCount < 80 && durationSec > 60) {
    findings.push({
      severity: "medium",
      category: "재사용 신호",
      message: "직접 말한 내용이 거의 없습니다. 해설·자막 등 직접 더한 가치를 늘리는 편이 안전합니다.",
    });
  }

  if (charsPerSec > 9) {
    findings.push({
      severity: "low",
      category: "전달력",
      message: `말이 빠릅니다(초당 ${charsPerSec.toFixed(1)}자). 자막이 있어야 따라오기 쉽습니다.`,
    });
  }

  if (stats.maxVolumeDb !== null && stats.maxVolumeDb > -0.5) {
    findings.push({
      severity: "medium",
      category: "음량",
      message: `소리가 최대치에 붙어 있습니다(max ${stats.maxVolumeDb.toFixed(1)}dB). 찌그러진 소리로 들릴 수 있습니다.`,
    });
  }

  if (stats.meanVolumeDb !== null && stats.meanVolumeDb < -30) {
    findings.push({
      severity: "low",
      category: "음량",
      message: `전체적으로 작습니다(평균 ${stats.meanVolumeDb.toFixed(1)}dB). 플랫폼 기준(-14 LUFS 안팎)에 맞춰 올리는 편이 좋습니다.`,
    });
  }

  const penalty = findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);

  const high = findings.filter((f) => f.severity === "high").length;
  const summary =
    high > 0
      ? `먼저 볼 것 ${high}건을 포함해 ${findings.length}건을 찾았습니다.`
      : findings.length > 0
        ? `크게 걸릴 만한 것은 없고, 확인해 볼 지점 ${findings.length}건입니다.`
        : "규칙에 걸리는 지점을 찾지 못했습니다.";

  // 심각한 것부터 보이게 정렬한다.
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    score,
    summary,
    findings,
    stats: {
      durationSec: Math.round(durationSec),
      speechSec: Math.round(speechSec),
      speechRatio: Number(speechRatio.toFixed(2)),
      charCount,
      charsPerSec: Number(charsPerSec.toFixed(1)),
      meanVolumeDb: stats.meanVolumeDb,
      maxVolumeDb: stats.maxVolumeDb,
    },
  };
}
