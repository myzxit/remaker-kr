import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOLS, getTool } from "@/lib/tools";
import { formatDuration, formatDate, STATUS_LABEL } from "@/lib/format";

export const metadata: Metadata = { title: "작업실" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/dashboard");

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { _count: { select: { outputs: true } } },
  });

  const doneCount = await prisma.output.count({
    where: { project: { userId: user.id }, status: "done" },
  });

  return (
    <div className="section">
      <p className="eyebrow">작업실</p>
      <h1 className="h1 text-3xl sm:text-4xl">{user.name || user.email.split("@")[0]}님</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "만든 작업", value: `${projects.length}개` },
          { label: "결과물", value: `${doneCount}개` },
          { label: "남은 크레딧", value: "무제한" },
        ].map((s) => (
          <div key={s.label} className="card">
            <div className="muted text-sm">{s.label}</div>
            <div className="mt-2 text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-14 text-xl font-bold">새 작업</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.filter((t) => t.isJob).map((t) => (
          <Link key={t.id} href={`/tools/${t.id}`} className="card py-4 transition hover:-translate-y-0.5">
            <div className="flex items-center gap-2">
              <span>{t.icon}</span>
              <span className="text-sm font-semibold">{t.name}</span>
            </div>
            <p className="muted mt-1 text-xs">{t.tagline}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-14 text-xl font-bold">지난 작업</h2>
      {projects.length === 0 ? (
        <p
          className="muted mt-5 rounded-2xl px-6 py-12 text-center text-sm"
          style={{ border: "1px dashed var(--line)" }}
        >
          아직 만든 작업이 없습니다. 위에서 도구를 골라 시작해 보세요.
        </p>
      ) : (
        <ul className="mt-5 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>
          {projects.map((p) => (
            <li key={p.id} style={{ borderBottom: "1px solid var(--line)" }}>
              <Link
                href={`/projects/${p.id}`}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition hover:opacity-80"
                style={{ background: "var(--surface)" }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    <span className="mr-2">{getTool(p.kind)?.icon ?? "📄"}</span>
                    {p.title}
                  </div>
                  <div className="muted mt-1 text-xs">
                    {getTool(p.kind)?.name ?? p.kind} · {formatDate(p.createdAt)}
                    {p.durationSec > 0 && ` · 원본 ${formatDuration(p.durationSec)}`}
                    {p._count.outputs > 0 && ` · 결과 ${p._count.outputs}개`}
                  </div>
                </div>
                <span
                  className={
                    p.status === "done" ? "chip chip-ok" : p.status === "failed" ? "chip chip-bad" : "chip"
                  }
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                  {!["done", "failed"].includes(p.status) && ` ${p.progress}%`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
