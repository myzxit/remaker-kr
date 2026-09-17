/**
 * 목소리 목록.
 *
 * Microsoft Edge 의 읽어주기 음성을 씁니다(edge-tts). API 키가 필요 없고 무료입니다.
 * 설치된 edge-tts 가 실제로 어떤 음성을 주는지는 `edge-tts --list-voices` 로 확인할 수 있습니다.
 */

export type Voice = {
  id: string;
  label: string;
  language: string;
  gender: "female" | "male";
  note?: string;
};

export const VOICES: Voice[] = [
  { id: "ko-KR-SunHiNeural", label: "선히", language: "ko", gender: "female", note: "차분한 기본 내레이션" },
  { id: "ko-KR-InJoonNeural", label: "인준", language: "ko", gender: "male", note: "낮고 안정적인 남성" },
  {
    id: "ko-KR-HyunsuMultilingualNeural",
    label: "현수 (다국어)",
    language: "ko",
    gender: "male",
    note: "한 목소리로 여러 언어를 읽습니다",
  },

  { id: "en-US-AriaNeural", label: "Aria", language: "en", gender: "female" },
  { id: "en-US-GuyNeural", label: "Guy", language: "en", gender: "male" },

  { id: "ja-JP-NanamiNeural", label: "ナナミ", language: "ja", gender: "female" },
  { id: "ja-JP-KeitaNeural", label: "ケイタ", language: "ja", gender: "male" },

  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓", language: "zh", gender: "female" },
  { id: "zh-CN-YunxiNeural", label: "云希", language: "zh", gender: "male" },

  { id: "es-ES-ElviraNeural", label: "Elvira", language: "es", gender: "female" },
  { id: "es-ES-AlvaroNeural", label: "Álvaro", language: "es", gender: "male" },
];

export const voicesFor = (language: string) => VOICES.filter((v) => v.language === language);

export function defaultVoice(language: string): string {
  return voicesFor(language)[0]?.id ?? "ko-KR-SunHiNeural";
}

export const getVoice = (id: string) => VOICES.find((v) => v.id === id);
