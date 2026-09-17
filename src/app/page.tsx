import Link from "next/link";
import RunForm from "@/components/RunForm";
import { TOOLS, isToolReady } from "@/lib/tools";
import { SUBTITLE_STYLES } from "@/lib/subtitleStyles";

const STEPS = [
  { n: "01", t: "링크를 넣거나 파일을 올립니다", b: "유튜브·인스타그램·틱톡 주소, 또는 내 영상 파일." },
  { n: "02", t: "무슨 말을 하는지 받아 적습니다", b: "음성 인식으로 문장과 시각을 뽑아냅니다." },
  { n: "03", t: "길이에 맞춰 대본을 새로 씁니다", b: "1분이든 28분이든, 지정한 길이에 맞게 내용을 추립니다." },
  { n: "04", t: "새 목소리로 읽고 다시 붙입니다", b: "원본 소리는 버리고, 새 내레이션 길이에 맞춰 화면을 재배치합니다." },
  { n: "05", t: "효과음과 자막을 얹습니다", b: "전환 효과음, 새 자막까지 구워 mp4로 내보냅니다." },
];

export default function HomePage() {
  return (
    <>
      {/* 히어로 */}
      <section className="section grid items-start gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="eyebrow">크레딧 없음 · 전부 무료</p>
          <h1 className="h1">
            영상을 통째로
            <br />
            <span style={{ color: "var(--color-brand)" }}>다시 만듭니다</span>
          </h1>
          <p className="muted mt-6 max-w-xl text-lg leading-relaxed">
            <b>링크 하나, 파일 하나면 됩니다.</b> 원본의 목소리·효과음·자막을 걷어내고 새
            내레이션과 새 자막을 입힙니다. 언어·목소리·화면 비율·결과 길이(1~28분)를 원본에서
            알아서 정하고, 직접 고르고 싶으면 언제든 바꿀 수 있습니다.
          </p>

          <ul className="muted mt-8 space-y-2 text-sm">
            <li>· 올리기만 하면 됩니다. 나머지는 원본을 보고 알아서 맞춥니다</li>
            <li>· 원본 오디오는 섞이지 않습니다. 아예 가져오지 않습니다</li>
            <li>· 자막 타이밍은 새 목소리에서 직접 받아 씁니다 — 싱크가 밀리지 않습니다</li>
            <li>· 결제도 크레딧도 없습니다. 내 서버에 올려 쓰는 오픈소스입니다</li>
          </ul>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login?mode=signup" className="btn-primary">
              무료로 시작하기
            </Link>
            <Link href="/guide" className="btn-ghost">
              어떻게 동작하나요?
            </Link>
          </div>
        </div>

        <RunForm tool="remake" compact />
      </section>

      {/* 도구 */}
      <section id="tools" className="section" style={{ borderTop: "1px solid var(--line)" }}>
        <p className="eyebrow">도구</p>
        <h2 className="h2">만드는 데 필요한 것들</h2>
        <p className="muted mt-4 max-w-2xl">
          영상 하나를 올리는 데 들어가는 일은 정해져 있습니다. 가져오고, 다듬고, 옮기고, 점검하고.
          그 각각을 도구로 나눠 뒀습니다.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const ready = isToolReady(tool);
            return (
              <Link
                key={tool.id}
                href={tool.isJob ? `/tools/${tool.id}` : "/library"}
                className="card transition hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-2xl">{tool.icon}</span>
                  {tool.badge && (
                    <span className={tool.badge === "핵심" ? "chip chip-brand" : "chip"}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{tool.name}</h3>
                <p className="mt-1 text-sm font-medium" style={{ color: "var(--color-accent)" }}>
                  {tool.tagline}
                </p>
                <p className="muted mt-3 text-sm leading-relaxed">{tool.description}</p>
                {!ready && (
                  <p className="muted mt-3 text-xs">
                    설정 필요: {tool.requires.join(", ")}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* 동작 방식 */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="section">
          <p className="eyebrow">동작 방식</p>
          <h2 className="h2">재구성은 이렇게 돌아갑니다</h2>

          <div className="mt-10 grid gap-8 md:grid-cols-5">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="text-sm font-bold" style={{ color: "var(--color-brand)" }}>
                  {s.n}
                </div>
                <h3 className="mt-3 text-base font-semibold">{s.t}</h3>
                <p className="muted mt-2 text-sm leading-relaxed">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 자막 스타일 */}
      <section className="section">
        <p className="eyebrow">자막 스타일</p>
        <h2 className="h2">여섯 가지 중에 고릅니다</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {SUBTITLE_STYLES.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>
              <div className="aspect-[9/16] w-full" style={{ background: s.preview }} />
              <div className="p-3" style={{ background: "var(--surface)" }}>
                <h3 className="text-sm font-semibold">{s.name}</h3>
                <p className="muted mt-1 text-xs leading-relaxed">{s.tagline}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 요금 */}
      <section style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="section text-center">
          <p className="eyebrow">요금</p>
          <h2 className="h2">전부 무료입니다</h2>
          <p className="muted mx-auto mt-4 max-w-2xl">
            크레딧도, 구독도, 결제 페이지도 없습니다. 직접 서버에 올려 쓰는 오픈소스라 만드는 사람이
            받을 돈이 없습니다. 대신 처리 속도는 올려 둔 서버 성능만큼입니다.
          </p>

          <div className="card mx-auto mt-10 max-w-md text-left">
            <div className="text-3xl font-bold">₩0</div>
            <p className="muted mt-1 text-sm">계속 무료</p>
            <ul className="muted mt-6 space-y-2 text-sm">
              <li>· 모든 도구 사용</li>
              <li>· 결과물 개수 제한 없음</li>
              <li>· 영상 길이 28분까지</li>
              <li>· 다시 만들기 무제한</li>
              <li>· 영상이 외부로 나가지 않음</li>
            </ul>
            <Link href="/login?mode=signup" className="btn-primary mt-8 w-full">
              시작하기
            </Link>
          </div>
        </div>
      </section>

      {/* 마무리 */}
      <section className="section text-center">
        <div className="card mx-auto max-w-3xl px-8 py-14">
          <h2 className="text-3xl font-bold">영상 하나로 시작해 보세요</h2>
          <p className="muted mt-4">
            10분짜리 영상을 3분으로 줄이고, 목소리를 바꾸고, 자막까지 넣는 데 명령 한 줄이면 됩니다.
          </p>
          <Link href="/tools/remake" className="btn-primary mt-8">
            재구성 해보기
          </Link>
        </div>
      </section>
    </>
  );
}
