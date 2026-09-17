import type { Metadata } from "next";
import { notFound } from "next/navigation";

type Doc = { title: string; updated: string; sections: Array<{ h: string; p: string[] }> };

const DOCS: Record<string, Doc> = {
  terms: {
    title: "이용약관",
    updated: "2026-09-17",
    sections: [
      {
        h: "제1조 (목적)",
        p: [
          "이 약관은 리메이커(이하 “서비스”)의 이용 조건을 정합니다.",
          "리메이커는 오픈소스 프로젝트이며, 이 문서는 실제 운영 시 채워 넣을 내용을 보여 주는 견본입니다. 상업적으로 운영하려면 변호사의 검토를 받은 약관으로 교체해야 합니다.",
        ],
      },
      {
        h: "제2조 (서비스의 내용)",
        p: [
          "서비스는 이용자가 제공한 영상을 분석해, 새 내레이션·효과음·자막을 입힌 영상을 만들어 줍니다.",
          "결과물의 품질은 원본의 음질과 발화량에 따라 달라지며, 특정 수준의 성과를 보장하지 않습니다.",
        ],
      },
      {
        h: "제3조 (이용자의 의무)",
        p: [
          "이용자는 본인이 저작권을 보유하거나 적법하게 이용할 권리가 있는 영상만 처리해야 합니다.",
          "타인의 저작물을 무단으로 재구성해 발생한 분쟁의 책임은 전적으로 이용자에게 있습니다.",
          "타인을 사칭하거나 오인하게 하는 목적으로 목소리를 바꾸어서는 안 됩니다.",
        ],
      },
      {
        h: "제4조 (요금)",
        p: ["서비스는 무료로 제공됩니다. 크레딧, 구독, 결제 기능이 존재하지 않습니다."],
      },
      {
        h: "제5조 (책임의 제한)",
        p: [
          "서비스는 있는 그대로 제공되며, 특정 목적에의 적합성을 보증하지 않습니다.",
          "외부 서비스(영상 플랫폼, 음성 합성 등)의 정책 변경으로 일부 기능이 멈출 수 있습니다.",
        ],
      },
    ],
  },
  privacy: {
    title: "개인정보처리방침",
    updated: "2026-09-17",
    sections: [
      {
        h: "1. 수집하는 항목",
        p: [
          "필수: 이메일 주소와 단방향 암호화된 비밀번호.",
          "자동 수집: 작업 생성 시각과 처리 상태.",
          "이용자가 올린 영상과 그 음성 인식 결과, 만들어진 결과물.",
        ],
      },
      {
        h: "2. 이용 목적",
        p: [
          "회원 식별, 작업 처리, 오류 원인 파악에만 씁니다.",
          "광고 목적으로 제3자에게 제공하지 않습니다.",
        ],
      },
      {
        h: "3. 외부 전송",
        p: [
          "영상과 음성 파일은 서버 밖으로 나가지 않습니다.",
          "다만 목소리 합성은 외부 음성 서비스를 호출하므로, 읽을 대본 텍스트가 해당 서비스로 전송됩니다. 민감한 내용이 담긴 영상이라면 이 점을 고려해 주세요.",
          "링크로 영상을 가져올 때는 해당 플랫폼에 요청이 나갑니다.",
        ],
      },
      {
        h: "4. 보관과 파기",
        p: [
          "작업을 삭제하면 원본과 결과물, 인식 결과가 함께 삭제됩니다.",
          "회원 탈퇴 시 계정 정보와 관련 파일을 지체 없이 파기합니다.",
        ],
      },
    ],
  },
  copyright: {
    title: "저작권 안내",
    updated: "2026-09-17",
    sections: [
      {
        h: "이 도구로 해도 되는 일",
        p: [
          "내가 만든 영상을 다른 언어로 더빙해 해외 채널에 올리기.",
          "내 긴 영상을 짧게 줄여 다시 쓰기.",
          "내 영상의 내레이션을 다른 목소리로 바꾸기.",
          "촬영본에 새 자막과 효과음을 넣어 완성하기.",
        ],
      },
      {
        h: "하면 안 되는 일",
        p: [
          "남의 영상을 받아 목소리와 자막만 바꿔 내 채널에 올리기. 이는 저작권 침해이며, 플랫폼의 재사용 콘텐츠 정책에도 걸립니다.",
          "타인의 목소리인 것처럼 오인하게 만들기.",
          "출처를 지우기 위한 목적으로 화면을 자르거나 변형하기.",
        ],
      },
      {
        h: "책임",
        p: [
          "어떤 영상을 넣을지는 이용자가 정합니다. 이 도구는 넣은 영상의 권리 관계를 확인하지 않으며, 확인할 방법도 없습니다.",
          "침해로 인한 분쟁, 채널 제재, 손해배상 책임은 이용자에게 있습니다.",
        ],
      },
    ],
  },
  oss: {
    title: "오픈소스 고지",
    updated: "2026-09-17",
    sections: [
      {
        h: "사용 중인 주요 오픈소스",
        p: [
          "Next.js (MIT) · React (MIT) · Tailwind CSS (MIT)",
          "Prisma (Apache-2.0) — 데이터베이스 접근",
          "Auth.js / next-auth (ISC) — 인증",
          "FFmpeg (LGPL-2.1 이상 / 빌드 구성에 따라 GPL) — 영상 처리",
          "yt-dlp (Unlicense) — 영상 가져오기",
          "faster-whisper (MIT) · CTranslate2 (MIT) — 음성 인식",
          "OpenAI Whisper 모델 가중치 (MIT)",
          "edge-tts (GPL-3.0) — 음성 합성 클라이언트",
          "coqui-tts (MPL-2.0) — 목소리 복제 엔진 (선택 설치)",
          "XTTS-v2 모델 가중치 (Coqui Public Model License — 비상업)",
          "Pretendard (SIL Open Font License 1.1) — 본문 글꼴",
        ],
      },
      {
        h: "유의사항",
        p: [
          "FFmpeg 는 빌드에 포함한 코덱 구성에 따라 적용 라이선스가 달라집니다. 상업적으로 배포한다면 사용 중인 빌드 구성을 확인하세요.",
          "edge-tts 는 GPL-3.0 입니다. 별도 프로세스로 호출해 쓰고 있으며, 배포 형태에 따라 의무가 달라질 수 있습니다.",
          "음성 합성은 Microsoft Edge 의 읽어주기 서비스를 이용합니다. 해당 서비스의 이용 조건을 확인하고 쓰세요.",
          "‘내 목소리’(목소리 복제)에 쓰는 XTTS-v2 모델 가중치는 Coqui Public Model License 로 비상업 용도입니다. 상업적으로 운영한다면 MIT 계열 엔진으로 교체해야 합니다. 이 기능은 기본 설치에 포함되어 있지 않습니다.",
        ],
      },
      {
        h: "이 프로젝트의 라이선스",
        p: ["리메이커 자체 코드는 MIT 라이선스로 공개되어 있습니다."],
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: DOCS[slug]?.title ?? "약관" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();

  return (
    <div className="section max-w-3xl">
      <h1 className="text-3xl font-bold">{doc.title}</h1>
      <p className="muted mt-2 text-sm">최종 수정일: {doc.updated}</p>

      <div className="mt-12 space-y-10">
        {doc.sections.map((section) => (
          <section key={section.h}>
            <h2 className="text-lg font-semibold">{section.h}</h2>
            <div className="mt-3 space-y-2">
              {section.p.map((paragraph, i) => (
                <p key={i} className="muted text-sm leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
