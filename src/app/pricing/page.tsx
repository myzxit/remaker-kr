import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "요금",
  description: "크레딧도 구독도 없습니다. 전부 무료입니다.",
};

export default function PricingPage() {
  return (
    <div className="section max-w-3xl text-center">
      <p className="eyebrow">요금</p>
      <h1 className="h1 text-3xl sm:text-4xl">₩0</h1>
      <p className="muted mx-auto mt-5 max-w-xl leading-relaxed">
        크레딧, 구독, 결제 페이지가 없습니다. 만드는 쪽에서 받을 돈이 없기 때문입니다. 직접 서버에
        올려 쓰는 오픈소스라, 드는 비용은 그 서버 값뿐입니다.
      </p>

      <div className="card mx-auto mt-10 max-w-md text-left">
        <ul className="space-y-3 text-sm">
          {[
            "모든 도구 사용",
            "결과물 개수 제한 없음",
            "영상 길이 25분까지",
            "다시 만들기 무제한",
            "영상이 외부로 나가지 않음",
            "계정당 동시 작업 3건",
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <span style={{ color: "var(--color-accent)" }}>✓</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <Link href="/login?mode=signup" className="btn-primary mt-8 w-full">
          시작하기
        </Link>
      </div>

      <div className="card mx-auto mt-8 max-w-md text-left">
        <h2 className="text-base font-semibold">그래서 뭐가 제한되나요</h2>
        <p className="muted mt-3 text-sm leading-relaxed">
          속도입니다. 음성 인식과 렌더링이 서버 CPU를 오래 씁니다. 여러 명이 동시에 쓰면 줄을 서게
          되고, 그래서 계정당 동시 작업을 3건으로 묶어 뒀습니다. 더 빠르게 쓰려면 GPU가 있는 서버에
          올리시면 됩니다.
        </p>
      </div>
    </div>
  );
}
