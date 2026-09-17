import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "자주 묻는 질문",
  description: "재구성 품질, 원본 자막 처리, 저작권, 처리 시간에 대한 답변.",
};

const FAQS = [
  {
    q: "원본 목소리가 정말 안 들어가나요?",
    a: "안 들어갑니다. 원본 오디오를 섞지 않는 게 아니라, 애초에 가져오지 않습니다. 렌더링할 때 오디오 트랙은 새로 만든 파일에서만 가져옵니다. 원본의 배경음악이나 효과음도 함께 사라집니다.",
  },
  {
    q: "화면에 박힌 자막은 지워지나요?",
    a: "완전히는 안 됩니다. 영상에 구워진 글자를 지우려면 인페인팅 모델이 필요한데 GPU 없이는 현실적이지 않습니다. 대신 새 자막으로 덮거나, 그 영역을 잘라내거나, 흐리게 하는 세 가지 중에 고르실 수 있습니다. 원본에 자막이 없다면 해당 없습니다.",
  },
  {
    q: "길이는 어떻게 맞춰지나요?",
    a: "1분에서 25분 사이로 지정하면, 그 길이를 채울 만큼만 문장을 골라 대본을 만듭니다. 실제 결과물 길이는 새 목소리가 읽는 시간에 따라 결정되므로 지정값과 몇 초에서 몇십 초 차이가 날 수 있습니다. 영상은 내레이션 길이에 정확히 맞춰 재배치됩니다.",
  },
  {
    q: "내용이 이상하게 요약되지 않나요?",
    a: "문장을 새로 쓰지 않고 원본 문장을 고르는 방식이라, 없는 말이 지어내지지는 않습니다. 대신 문장 사이 맥락이 끊길 수 있습니다. 그게 싫으면 대본 옵션에서 '원본 순서 그대로'를 고르세요.",
  },
  {
    q: "자막 싱크가 밀리지 않나요?",
    a: "밀리지 않습니다. 자막 타이밍을 추정하지 않고, 음성을 만들 때 나오는 문장별 시각을 그대로 씁니다.",
  },
  {
    q: "남의 유튜브 영상을 넣어도 되나요?",
    a: "안 됩니다. 본인이 권리를 가진 영상에만 쓰세요. 남의 영상을 재구성해 올리는 것은 저작권 침해이고, 플랫폼 정책 위반으로 채널이 제재를 받을 수 있습니다. 이 도구는 내 영상을 다른 언어로 옮기거나 길이를 줄여 다시 쓰는 용도입니다.",
  },
  {
    q: "얼마나 걸리나요?",
    a: "받아 적기가 대부분을 차지합니다. CPU 서버에서 10분 영상이면 전체 5~15분 정도입니다. GPU가 있으면 훨씬 빨라집니다.",
  },
  {
    q: "정말 공짜인가요?",
    a: "결제가 아예 구현돼 있지 않습니다. 직접 서버에 올려 쓰는 오픈소스라 비용은 그 서버 값뿐입니다. 음성 합성도 API 키가 필요 없는 무료 엔진을 씁니다.",
  },
  {
    q: "영상이 외부로 나가나요?",
    a: "원본과 결과물은 서버 안에만 있습니다. 다만 목소리 합성은 외부 음성 서비스를 호출하므로, 읽을 대본 텍스트는 밖으로 나갑니다. 영상이나 음성 파일은 나가지 않습니다.",
  },
];

export default function FaqPage() {
  return (
    <div className="section max-w-3xl">
      <p className="eyebrow">자주 묻는 질문</p>
      <h1 className="h1 text-3xl sm:text-4xl">궁금한 것들</h1>

      <div className="mt-10" style={{ borderTop: "1px solid var(--line)" }}>
        {FAQS.map((item) => (
          <details key={item.q} className="group py-5" style={{ borderBottom: "1px solid var(--line)" }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold">
              {item.q}
              <span className="muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="muted mt-3 text-sm leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
