import { NextResponse } from "next/server";
import fs from "node:fs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { projectDir, resolveSafe } from "@/lib/paths";

/** 진행 상황 폴링용. 자막 원본처럼 큰 값은 빼고 보낸다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: { outputs: { orderBy: { index: "asc" } } },
  });
  if (!project) return NextResponse.json({ error: "없는 작업입니다." }, { status: 404 });

  const { transcriptJson, scriptJson, ...rest } = project;
  return NextResponse.json({
    project: rest,
    script: scriptJson ? JSON.parse(scriptJson) : null,
    hasTranscript: Boolean(transcriptJson),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId: session.user.id } });
  if (!project) return NextResponse.json({ error: "없는 작업입니다." }, { status: 404 });

  await prisma.project.delete({ where: { id } });
  fs.rmSync(projectDir(id), { recursive: true, force: true });

  // 업로드 원본은 projects/ 밖에 있으니 따로 지운다.
  if (project.sourceType === "upload" && project.sourcePath) {
    const abs = resolveSafe(project.sourcePath);
    if (abs) fs.rmSync(abs, { force: true });
  }

  return NextResponse.json({ ok: true });
}
