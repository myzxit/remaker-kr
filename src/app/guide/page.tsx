import type { Metadata } from "next";
import Link from "next/link";
import { SUBTITLE_CLEANUP, LANGUAGES } from "@/lib/tools";

export const metadata: Metadata = {
  title: "사용법",
  description: "재구성이 실제로 어떤 순서로 돌아가는지, 무엇이 되고 무엇이 안 되는지.",
};

export default function GuidePage() {
  return (
    <div className="section max-w-3xl">
      <p className="eyebrow">사용법</p>
      <h1 className="h1 text-3xl sm:text-4xl">재구성은 이렇게 돌아갑니다</h1>

      <h2 className="mt-12 text-xl font-bold">1. 원본에서 말을 받아 적습니다</h2>
      <p className="muted mt-3 leading-relaxed">
        음성 인식으로 문장을 뽑고, 각 문장이 원본 어느 시각에 있었는지 기록합니다. 이 정보가 나중에
        화면을 붙일 때 쓰입니다. 말소리가 없는 영상은 여기서 멈춥니다.
      </p>

      <h2 className="mt-10 text-xl font-bold">2. 길이에 맞춰 대본을 새로 씁니다</h2>
      <p className="muted mt-3 leading-relaxed">
        <b>핵심만 추리기</b>를 고르면 문장마다 점수를 매겨(질문형 도입, 구체적 수치, 핵심 정리 표현,
        전환 접속사, 말의 밀도) 높은 순으로 고른 뒤 시간순으로 되돌립니다. 지정한 길이를 채울
        만큼만 고릅니다. <b>원본 순서 그대로</b>를 고르면 앞에서부터 순서대로 채웁니다.
      </p>
      <p className="muted mt-3 leading-relaxed">
        어느 쪽이든 &quot;음…&quot;, &quot;그러니까&quot; 같은 군더더기는 빼고, 문장 끝에 마침표를
        붙여 읽을 때 자연스럽게 만듭니다.
      </p>

      <h2 className="mt-10 text-xl font-bold">3. 새 목소리로 읽습니다</h2>
      <p className="muted mt-3 leading-relaxed">
        대본 전체를 한 번에 읽힙니다. 이때 문장별 시각이 같이 나오는데, 그 값을 그대로 자막 타이밍에
        씁니다. 그래서 자막이 목소리보다 앞서거나 밀리지 않습니다. 지원 언어는{" "}
        {LANGUAGES.map((l) => l.label).join(" · ")}입니다.
      </p>

      <h2 className="mt-10 text-xl font-bold">4. 화면을 다시 붙입니다</h2>
      <p className="muted mt-3 leading-relaxed">
        여기가 핵심입니다. <b>원본 오디오는 아예 가져오지 않습니다.</b> 화면만 떼어 와서, 새
        내레이션이 필요한 길이만큼 원본을 앞에서부터 순서대로 소비합니다. 빨리감기나 느리게가 없어서
        움직임이 어색해지지 않고, 영상 길이가 내레이션과 정확히 맞습니다. 원본이 모자라면 처음으로
        돌아가 다시 씁니다.
      </p>

      <h2 className="mt-10 text-xl font-bold">5. 원본 자막 처리</h2>
      <p className="muted mt-3 leading-relaxed">
        화면에 이미 구워진 자막은 완전히 지울 수 없습니다. 지우려면 영상 인페인팅이 필요한데 GPU
        없이는 현실적이지 않습니다. 네 가지 중에 고릅니다.
      </p>
      <div className="mt-5 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>
        <table className="w-full text-left text-sm">
          <thead style={{ background: "var(--surface)" }}>
            <tr>
              <th className="px-4 py-3 font-semibold">방법</th>
              <th className="px-4 py-3 font-semibold">설명</th>
            </tr>
          </thead>
          <tbody>
            {SUBTITLE_CLEANUP.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--line)" }}>
                <td className="px-4 py-3 font-medium">{c.label}</td>
                <td className="muted px-4 py-3">{c.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 text-xl font-bold">얼마나 걸리나요</h2>
      <p className="muted mt-3 leading-relaxed">
        받아 적기가 가장 오래 걸립니다. CPU 서버에서는 원본 길이와 비슷하거나 조금 더 걸리고, GPU가
        있으면 몇 배 빨라집니다. 렌더링은 결과물 길이에 비례합니다. 10분 원본을 3분으로 재구성하면
        보통 5~15분 사이입니다.
      </p>

      <h2 className="mt-10 text-xl font-bold">지켜 주셔야 할 것</h2>
      <p className="muted mt-3 leading-relaxed">
        <b>본인이 권리를 가진 영상에만 쓰세요.</b> 남의 영상을 재구성해 올리는 것은 저작권 침해이고
        플랫폼 정책 위반입니다. 이 도구는 내 영상을 다른 언어로 옮기거나, 길이를 줄여 다시 쓰거나,
        목소리를 바꾸는 용도로 만들었습니다.
      </p>

      <Link href="/tools/remake" className="btn-primary mt-12">
        재구성 해보기
      </Link>
    </div>
  );
}
