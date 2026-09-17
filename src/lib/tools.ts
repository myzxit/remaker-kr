import { z } from "zod";

/**
 * 도구 카탈로그. 랜딩 페이지 카드, 작업 생성 검증, 워커 분기가 전부 여기를 본다.
 *
 * requires 가 비어 있지 않은 도구는 추가 설정이 있어야 켜진다.
 * (없으면 UI 에서 "설정 필요" 로 표시하고 실행을 막는다)
 */

export type ToolId =
  | "remake"
  | "dub"
  | "shorts"
  | "silence"
  | "extract"
  | "comment"
  | "policy"
  | "cloud"
  | "image"
  | "trend";

export type Tool = {
  id: ToolId;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  /** 워커가 처리하는 작업인지(= 프로젝트를 만드는지) */
  isJob: boolean;
  /** 동작에 필요한 환경변수. 비어 있으면 설치만으로 동작한다. */
  requires: string[];
  badge?: string;
};

export const TOOLS: Tool[] = [
  {
    id: "remake",
    name: "영상 재구성",
    tagline: "목소리·효과음·자막을 전부 새로 입힙니다",
    description:
      "원본 오디오를 통째로 걷어내고, 새 내레이션과 효과음, 새 자막을 얹어 다른 영상으로 다시 만듭니다. 1분에서 25분까지 길이를 지정하면 거기에 맞춰 대본과 화면을 재구성합니다.",
    icon: "🔁",
    isJob: true,
    requires: [],
    badge: "핵심",
  },
  {
    id: "dub",
    name: "다국어 더빙",
    tagline: "자막과 내레이션을 5개 언어로",
    description:
      "말을 알아듣고 번역해, 그 나라 목소리로 다시 읽어 줍니다. 자막도 함께 만들어 붙입니다. 한국어·영어·일본어·중국어·스페인어를 지원합니다.",
    icon: "🌏",
    isJob: true,
    requires: [],
  },
  {
    id: "shorts",
    name: "숏폼 만들기",
    tagline: "긴 영상에서 짧은 영상 여러 개",
    description:
      "말의 밀도와 훅 표현으로 구간을 점수화해 하이라이트를 고르고, 세로 비율로 잘라 자막까지 넣습니다.",
    icon: "✂️",
    isJob: true,
    requires: [],
  },
  {
    id: "silence",
    name: "무음 제거",
    tagline: "늘어지는 구간만 걷어내기",
    description:
      "말이 끊긴 구간을 찾아 잘라냅니다. 같은 내용이라도 체감 속도가 달라집니다. 자막 타이밍도 함께 다시 계산합니다.",
    icon: "⚡",
    isJob: true,
    requires: [],
  },
  {
    id: "extract",
    name: "영상 가져오기",
    tagline: "링크 하나로 원본 확보",
    description:
      "유튜브·인스타그램·틱톡 링크를 넣으면 원본을 받아 보관함에 넣습니다. 다른 도구의 재료로 바로 쓸 수 있습니다.",
    icon: "⬇️",
    isJob: true,
    requires: [],
  },
  {
    id: "comment",
    name: "댓글 이미지",
    tagline: "댓글 캡처 느낌의 그래픽",
    description:
      "닉네임과 내용을 넣으면 영상에 얹기 좋은 댓글 카드 이미지를 만듭니다. 서버에서 SVG 로 그려 PNG 로 내보냅니다.",
    icon: "💬",
    isJob: true,
    requires: [],
  },
  {
    id: "policy",
    name: "정책 사전 점검",
    tagline: "올리기 전에 걸릴 만한 것 찾기",
    description:
      "자막을 훑어 수익화에서 문제될 소지가 있는 표현, 과도한 재사용 신호, 길이·음량 같은 형식 문제를 짚어 줍니다. 판정이 아니라 참고용 경고입니다.",
    icon: "🛡️",
    isJob: true,
    requires: [],
  },
  {
    id: "cloud",
    name: "보관함",
    tagline: "원본과 결과물을 한곳에",
    description: "업로드한 영상과 만들어진 결과물을 모아 두고, 다른 도구의 입력으로 다시 씁니다.",
    icon: "📦",
    isJob: false,
    requires: [],
  },
  {
    id: "image",
    name: "이미지 생성·편집",
    tagline: "한국어로 적으면 그림으로",
    description:
      "Stable Diffusion 계열 엔진(ComfyUI · Automatic1111)에 연결해 씁니다. 이미지 생성은 GPU 가 필요해서, 엔진 주소를 넣어야 켜집니다.",
    icon: "🎨",
    isJob: true,
    requires: ["IMAGE_API_URL"],
    badge: "엔진 필요",
  },
  {
    id: "trend",
    name: "트렌드",
    tagline: "나라별로 지금 뜨는 것",
    description:
      "유튜브 인기 급상승을 나라별로 모아 봅니다. 유튜브 데이터 API 키가 있어야 동작합니다.",
    icon: "📈",
    isJob: true,
    requires: ["YOUTUBE_API_KEY"],
    badge: "API 키 필요",
  },
];

export const getTool = (id: string) => TOOLS.find((t) => t.id === id);

export function isToolReady(tool: Tool): boolean {
  return tool.requires.every((key) => Boolean(process.env[key]));
}

// ─── 도구별 설정 스키마 ────────────────────────────────────────────────────

/** 재구성 결과 길이. 1분 ~ 25분. */
export const MIN_TARGET_SEC = 60;
export const MAX_TARGET_SEC = 25 * 60;

export const LANGUAGES = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "영어" },
  { id: "ja", label: "일본어" },
  { id: "zh", label: "중국어" },
  { id: "es", label: "스페인어" },
] as const;

export const ASPECTS = [
  { id: "16:9", label: "16:9 가로", width: 1920, height: 1080 },
  { id: "9:16", label: "9:16 세로", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1 정사각", width: 1080, height: 1080 },
] as const;

/** 원본 자막(화면에 박힌 글자) 처리 방법 */
export const SUBTITLE_CLEANUP = [
  { id: "cover", label: "새 자막으로 덮기", hint: "가장 빠릅니다. 원본 자막 자리에 새 자막을 올립니다." },
  { id: "crop", label: "잘라내기", hint: "자막이 있던 아래쪽을 잘라냅니다. 화면이 조금 좁아집니다." },
  { id: "blur", label: "흐리게", hint: "해당 영역만 뭉갭니다. 자국은 남습니다." },
  { id: "none", label: "그대로 두기", hint: "원본 자막을 건드리지 않습니다." },
] as const;

export const remakeOptions = z.object({
  targetSec: z.number().int().min(MIN_TARGET_SEC).max(MAX_TARGET_SEC).default(180),
  language: z.enum(["ko", "en", "ja", "zh", "es"]).default("ko"),
  voice: z.string().default("ko-KR-SunHiNeural"),
  /** 말 속도 (-50% ~ +50%) */
  rate: z.number().int().min(-50).max(50).default(0),
  aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  subtitleCleanup: z.enum(["cover", "crop", "blur", "none"]).default("cover"),
  subtitleStyle: z.string().default("clean"),
  burnSubtitles: z.boolean().default(true),
  /** 장면 전환마다 효과음 */
  sfx: z.boolean().default(true),
  /** 배경음 볼륨 (0 = 끔) */
  bgmVolume: z.number().min(0).max(0.5).default(0.12),
  /** 대본을 요약해 압축할지, 원문을 그대로 읽을지 */
  scriptMode: z.enum(["condense", "faithful"]).default("condense"),
});

export const dubOptions = z.object({
  language: z.enum(["ko", "en", "ja", "zh", "es"]).default("en"),
  voice: z.string().default(""),
  rate: z.number().int().min(-50).max(50).default(0),
  keepOriginalAudio: z.boolean().default(false),
  originalVolume: z.number().min(0).max(1).default(0.15),
  burnSubtitles: z.boolean().default(true),
  subtitleStyle: z.string().default("clean"),
});

export const shortsOptions = z.object({
  count: z.number().int().min(1).max(10).default(0),
  minSec: z.number().int().min(10).max(90).default(20),
  maxSec: z.number().int().min(15).max(180).default(60),
  aspect: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
  subtitleStyle: z.string().default("clean"),
  removeSilence: z.boolean().default(true),
});

export const silenceOptions = z.object({
  thresholdSec: z.number().min(0.2).max(3).default(0.6),
  padSec: z.number().min(0).max(1).default(0.12),
  burnSubtitles: z.boolean().default(false),
  subtitleStyle: z.string().default("clean"),
});

export const extractOptions = z.object({
  maxHeight: z.number().int().min(360).max(2160).default(1080),
});

export const commentOptions = z.object({
  nickname: z.string().min(1).max(40),
  body: z.string().min(1).max(300),
  likes: z.number().int().min(0).max(999999).default(1200),
  theme: z.enum(["light", "dark"]).default("dark"),
});

export const policyOptions = z.object({});

export const imageOptions = z.object({
  prompt: z.string().min(1).max(600),
  count: z.number().int().min(1).max(4).default(1),
  aspect: z.enum(["16:9", "9:16", "1:1"]).default("1:1"),
});

export const trendOptions = z.object({
  region: z.string().length(2).default("KR"),
});

export const OPTION_SCHEMAS: Record<string, z.ZodTypeAny> = {
  remake: remakeOptions,
  dub: dubOptions,
  shorts: shortsOptions,
  silence: silenceOptions,
  extract: extractOptions,
  comment: commentOptions,
  policy: policyOptions,
  image: imageOptions,
  trend: trendOptions,
};

/** 소스 영상이 필요한 도구들 */
export const NEEDS_SOURCE = new Set<string>(["remake", "dub", "shorts", "silence", "extract", "policy"]);
