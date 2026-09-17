/**
 * 자막 스타일. 값은 그대로 ASS 스타일로 바뀝니다(worker/subtitles.ts).
 * 색은 0xRRGGBB, 뒤에 @투명도를 붙일 수 있습니다.
 */

export type SubtitleStyle = {
  id: string;
  name: string;
  tagline: string;
  fontColor: string;
  borderColor: string;
  borderWidth: number;
  /** 자막 뒤 박스 색. null 이면 외곽선만 */
  boxColor: string | null;
  /** 화면 위에서부터의 비율 (0~1) */
  posY: number;
  /** 글자 크기 비율 (화면 높이 대비) */
  sizeRatio: number;
  preview: string;
};

export const SUBTITLE_STYLES: SubtitleStyle[] = [
  {
    id: "clean",
    name: "클린",
    tagline: "흰 글씨에 얇은 외곽선. 어디에나 무난합니다.",
    fontColor: "0xFFFFFF",
    borderColor: "0x101014",
    borderWidth: 4,
    boxColor: null,
    posY: 0.82,
    sizeRatio: 0.045,
    preview: "linear-gradient(135deg,#111827,#374151)",
  },
  {
    id: "band",
    name: "밴드",
    tagline: "어두운 띠 위의 흰 글씨. 배경이 복잡해도 읽힙니다.",
    fontColor: "0xFFFFFF",
    borderColor: "0x000000",
    borderWidth: 2,
    boxColor: "0x0B1020@0.82",
    posY: 0.84,
    sizeRatio: 0.043,
    preview: "linear-gradient(135deg,#0b1020,#1f2937)",
  },
  {
    id: "pop",
    name: "팝",
    tagline: "굵은 노랑에 진한 테두리. 예능·챌린지용.",
    fontColor: "0xFFE94A",
    borderColor: "0x141414",
    borderWidth: 9,
    boxColor: null,
    posY: 0.76,
    sizeRatio: 0.052,
    preview: "linear-gradient(135deg,#141414,#ffe94a)",
  },
  {
    id: "news",
    name: "뉴스",
    tagline: "빨간 띠. 시사·정보 전달에 어울립니다.",
    fontColor: "0xFFFFFF",
    borderColor: "0x8B0000",
    borderWidth: 2,
    boxColor: "0xD32F2F@0.92",
    posY: 0.86,
    sizeRatio: 0.04,
    preview: "linear-gradient(135deg,#8b0000,#d32f2f)",
  },
  {
    id: "soft",
    name: "소프트",
    tagline: "크림색 박스에 진한 글씨. 브이로그·감성.",
    fontColor: "0x2A2118",
    borderColor: "0xF6EFE2",
    borderWidth: 5,
    boxColor: "0xF6EFE2@0.94",
    posY: 0.8,
    sizeRatio: 0.042,
    preview: "linear-gradient(135deg,#f6efe2,#d8c4a4)",
  },
  {
    id: "mint",
    name: "민트",
    tagline: "민트 외곽선. 튀지 않으면서 눈에 들어옵니다.",
    fontColor: "0xFFFFFF",
    borderColor: "0x0E7C6B",
    borderWidth: 7,
    boxColor: null,
    posY: 0.79,
    sizeRatio: 0.046,
    preview: "linear-gradient(135deg,#0e7c6b,#4fd1c5)",
  },
];

export const getSubtitleStyle = (id: string | null | undefined) =>
  SUBTITLE_STYLES.find((s) => s.id === id) ?? SUBTITLE_STYLES[0];
