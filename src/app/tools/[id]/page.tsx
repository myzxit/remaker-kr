import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RunForm from "@/components/RunForm";
import { TOOLS, getTool, isToolReady, type ToolId } from "@/lib/tools";

export function generateStaticParams() {
  return TOOLS.filter((t) => t.isJob).map((t) => ({ id: t.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tool = getTool(id);
  return { title: tool ? `${tool.name} — ${tool.tagline}` : "도구" };
}

export default async function ToolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tool = getTool(id);
  if (!tool || !tool.isJob) notFound();

  const ready = isToolReady(tool);
  const others = TOOLS.filter((t) => t.isJob && t.id !== tool.id).slice(0, 4);

  return (
    <div className="section grid gap-12 lg:grid-cols-[1fr_480px]">
      <div>
        <Link href="/#tools" className="muted text-sm">
          ← 도구 목록
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="text-3xl">{tool.icon}</span>
          {tool.badge && (
            <span className={tool.badge === "핵심" ? "chip chip-brand" : "chip"}>{tool.badge}</span>
          )}
        </div>

        <h1 className="h1 text-3xl sm:text-4xl">{tool.name}</h1>
        <p className="mt-3 text-lg font-medium" style={{ color: "var(--color-accent)" }}>
          {tool.tagline}
        </p>
        <p className="muted mt-6 max-w-xl leading-relaxed">{tool.description}</p>

        {tool.id === "remake" && (
          <div className="card mt-8">
            <h2 className="text-base font-semibold">원본 자막은 어떻게 되나요?</h2>
            <p className="muted mt-2 text-sm leading-relaxed">
              화면에 이미 구워진 자막은 완전히 지울 수 없습니다. 지우려면 영상 인페인팅이 필요한데
              GPU 없이는 현실적이지 않습니다. 대신 <b>새 자막으로 덮기</b>(기본), <b>잘라내기</b>,{" "}
              <b>흐리게</b> 중에서 고르실 수 있습니다. 원본에 자막이 없다면 신경 쓰지 않으셔도
              됩니다.
            </p>
          </div>
        )}

        {!ready && (
          <div className="card mt-8">
            <h2 className="text-base font-semibold">설정이 필요합니다</h2>
            <p className="muted mt-2 text-sm">
              이 도구는 <code>{tool.requires.join(", ")}</code> 환경변수가 있어야 동작합니다. README
              의 설정 항목을 참고하세요.
            </p>
          </div>
        )}

        <h2 className="mt-12 text-base font-semibold">다른 도구</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {others.map((t) => (
            <Link key={t.id} href={`/tools/${t.id}`} className="card py-4 transition hover:-translate-y-0.5">
              <div className="flex items-center gap-2">
                <span>{t.icon}</span>
                <span className="text-sm font-semibold">{t.name}</span>
              </div>
              <p className="muted mt-1 text-xs">{t.tagline}</p>
            </Link>
          ))}
        </div>
      </div>

      <div>{ready ? <RunForm tool={tool.id as ToolId} /> : null}</div>
    </div>
  );
}
