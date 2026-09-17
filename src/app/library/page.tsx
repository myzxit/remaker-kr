import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBytes, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "보관함" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/library");

  const [assets, outputs] = await Promise.all([
    prisma.asset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.output.findMany({
      where: { project: { userId: user.id }, status: "done" },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { project: { select: { id: true, title: true, kind: true } } },
    }),
  ]);

  return (
    <div className="section">
      <p className="eyebrow">보관함</p>
      <h1 className="h1 text-3xl sm:text-4xl">원본과 결과물</h1>
      <p className="muted mt-4 max-w-2xl">
        가져온 원본과 만들어진 결과물이 모입니다. 파일은 이 서버 안에만 있습니다.
      </p>

      <h2 className="mt-12 text-xl font-bold">결과물 {outputs.length}개</h2>
      {outputs.length === 0 ? (
        <p className="muted mt-4 text-sm">아직 만들어진 결과물이 없습니다.</p>
      ) : (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {outputs.map((out) => (
            <Link
              key={out.id}
              href={`/projects/${out.project.id}`}
              className="overflow-hidden rounded-2xl transition hover:-translate-y-0.5"
              style={{ border: "1px solid var(--line)" }}
            >
              {out.thumbPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${out.thumbPath}`} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="muted grid aspect-video place-items-center text-xs">미리보기 없음</div>
              )}
              <div className="p-3" style={{ background: "var(--surface)" }}>
                <div className="truncate text-sm font-medium">{out.title}</div>
                <div className="muted mt-1 text-xs">{formatDate(out.createdAt)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mt-14 text-xl font-bold">가져온 원본 {assets.length}개</h2>
      {assets.length === 0 ? (
        <p className="muted mt-4 text-sm">
          아직 없습니다.{" "}
          <Link href="/tools/extract" className="underline">
            영상 가져오기
          </Link>
          로 링크에서 받아 올 수 있습니다.
        </p>
      ) : (
        <ul className="mt-5 overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)" }}>
          {assets.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)" }}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="muted mt-1 text-xs">
                  {formatDate(a.createdAt)} · {formatBytes(a.sizeBytes)}
                </div>
              </div>
              <a href={`/api/media/${a.filePath}`} className="btn-ghost px-4 py-2 text-xs" download>
                내려받기
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
