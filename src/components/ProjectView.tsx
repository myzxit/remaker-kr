"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDuration, STATUS_LABEL } from "@/lib/format";

type Output = {
  id: string;
  index: number;
  title: string;
  kind: string;
  filePath: string | null;
  thumbPath: string | null;
  meta: string | null;
  status: string;
  error: string | null;
};

type Project = {
  id: string;
  kind: string;
  title: string;
  status: string;
  progress: number;
  stage: string | null;
  error: string | null;
  durationSec: number;
  sourceUrl: string | null;
  outputs: Output[];
};

type ScriptLine = { index: number; text: string; srcStart: number; srcEnd: number };
type Script = { lines: ScriptLine[]; estimatedSec: number; mode: string } | null;

const ACTIVE = ["queued", "fetching", "transcribing", "scripting", "voicing", "rendering"];

export default function ProjectView({
  initial,
  initialScript,
}: {
  initial: Project;
  initialScript: Script;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  const [script, setScript] = useState<Script>(initialScript);
  const [showScript, setShowScript] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${initial.id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setProject(data.project);
    setScript(data.script);
  }, [initial.id]);

  // 처리 중일 때만 물어본다. 끝나면 타이머를 아예 걸지 않는다.
  useEffect(() => {
    if (!ACTIVE.includes(project.status)) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [project.status, refresh]);

  const isActive = ACTIVE.includes(project.status);

  async function remove() {
    if (!confirm("이 작업과 결과물을 모두 삭제합니다. 계속할까요?")) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard");
  }

  return (
    <div className="section">
      <Link href="/dashboard" className="muted text-sm">
        ← 작업실
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">{project.title}</h1>
          <p className="muted mt-2 text-sm">
            {project.durationSec > 0 && `원본 ${formatDuration(project.durationSec)} · `}
            결과 {project.outputs.filter((o) => o.status === "done").length}개
            {project.sourceUrl && (
              <>
                {" · "}
                <a href={project.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                  원본 보기
                </a>
              </>
            )}
          </p>
        </div>
        <button onClick={remove} className="btn-ghost text-red-500">
          삭제
        </button>
      </div>

      {isActive && (
        <div className="card mt-8">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {project.stage || STATUS_LABEL[project.status] || "처리 중"}
            </span>
            <span className="muted">{project.progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${Math.max(3, project.progress)}%`, background: "var(--color-brand)" }}
            />
          </div>
          <p className="muted mt-3 text-xs">
            창을 닫아도 계속 처리됩니다. 받아 적기와 렌더링이 오래 걸립니다.
          </p>
        </div>
      )}

      {project.status === "failed" && (
        <div className="mt-8 rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-600">
          <p className="font-semibold">처리에 실패했습니다.</p>
          <p className="mt-1 whitespace-pre-wrap">{project.error}</p>
        </div>
      )}

      {/* 결과물 */}
      {project.outputs.length > 0 && (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {project.outputs.map((out) => {
            const meta = out.meta ? (JSON.parse(out.meta) as Record<string, unknown>) : {};
            return (
              <div key={out.id} className="overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>
                {out.status === "done" && out.filePath ? (
                  out.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/media/${out.filePath}`} alt={out.title} className="w-full" />
                  ) : (
                    <video
                      controls
                      preload="metadata"
                      poster={out.thumbPath ? `/api/media/${out.thumbPath}` : undefined}
                      src={`/api/media/${out.filePath}`}
                      className="w-full bg-black"
                    />
                  )
                ) : (
                  <div className="muted grid aspect-video place-items-center text-sm">
                    {out.error || STATUS_LABEL[out.status] || out.status}
                  </div>
                )}

                <div className="p-4" style={{ background: "var(--surface)" }}>
                  <h3 className="truncate text-sm font-semibold">{out.title}</h3>
                  <p className="muted mt-1 text-xs">
                    {typeof meta.durationSec === "number" && `${formatDuration(meta.durationSec)} · `}
                    {typeof meta.resolution === "string" && meta.resolution}
                  </p>
                  {out.filePath && (
                    <a
                      href={`/api/media/${out.filePath}`}
                      download={`${out.title || "output"}.mp4`}
                      className="btn-primary mt-4 w-full py-2 text-xs"
                    >
                      내려받기
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 새로 쓴 대본 */}
      {script && script.lines?.length > 0 && (
        <div className="mt-12">
          <button onClick={() => setShowScript((v) => !v)} className="btn-ghost">
            {showScript ? "대본 접기" : `새로 쓴 대본 보기 (${script.lines.length}문장)`}
          </button>

          {showScript && (
            <div className="card mt-4">
              <p className="muted text-xs">
                {script.mode === "condense" ? "핵심만 추려 재구성" : "원본 순서 그대로"} · 예상{" "}
                {formatDuration(script.estimatedSec)}
              </p>
              <ol className="mt-4 space-y-2 text-sm">
                {script.lines.map((line) => (
                  <li key={line.index} className="flex gap-3">
                    <span className="muted shrink-0 text-xs tabular-nums">
                      {String(line.index + 1).padStart(2, "0")}
                    </span>
                    <span>{line.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {!isActive && project.outputs.length === 0 && project.status !== "failed" && (
        <p
          className="muted mt-12 rounded-2xl px-6 py-12 text-center text-sm"
          style={{ border: "1px dashed var(--line)" }}
        >
          결과물이 없습니다.
        </p>
      )}
    </div>
  );
}
