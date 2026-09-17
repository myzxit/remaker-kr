import { NextResponse } from "next/server";
import fs from "node:fs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toAbsolute, resolveSafe } from "@/lib/paths";
import { OPTION_SCHEMAS, NEEDS_SOURCE, getTool, isToolReady } from "@/lib/tools";

const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be",
  "instagram.com", "www.instagram.com",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com",
];

const schema = z.object({
  kind: z.string(),
  sourceType: z.enum(["link", "upload"]).optional(),
  url: z.string().url().optional(),
  path: z.string().optional(),
  title: z.string().max(200).optional(),
  options: z.record(z.unknown()).default({}),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const input = parsed.data;

  const tool = getTool(input.kind);
  if (!tool || !tool.isJob) {
    return NextResponse.json({ error: "없는 도구입니다." }, { status: 404 });
  }
  if (!isToolReady(tool)) {
    return NextResponse.json(
      { error: `이 도구는 추가 설정이 필요합니다: ${tool.requires.join(", ")}` },
      { status: 503 }
    );
  }

  const optionSchema = OPTION_SCHEMAS[tool.id];
  const optionsParsed = optionSchema ? optionSchema.safeParse(input.options) : { success: true as const, data: {} };
  if (!optionsParsed.success) {
    return NextResponse.json(
      { error: (optionsParsed as { error: z.ZodError }).error.issues[0].message },
      { status: 400 }
    );
  }

  // 한 사람이 큐를 독점하지 않도록, 처리 중인 작업이 쌓여 있으면 막는다.
  const pending = await prisma.project.count({
    where: {
      userId: session.user.id,
      status: { in: ["queued", "fetching", "transcribing", "scripting", "voicing", "rendering"] },
    },
  });
  if (pending >= 3) {
    return NextResponse.json(
      { error: "처리 중인 작업이 3개입니다. 하나가 끝나면 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  let title = input.title?.trim() || tool.name;
  let sourceUrl: string | null = null;
  let sourcePath: string | null = null;

  if (NEEDS_SOURCE.has(tool.id)) {
    const sourceType = input.sourceType ?? "link";

    if (sourceType === "link") {
      if (!input.url) return NextResponse.json({ error: "영상 주소가 필요합니다." }, { status: 400 });

      const host = new URL(input.url).hostname;
      if (!ALLOWED_HOSTS.includes(host)) {
        return NextResponse.json(
          { error: "유튜브·인스타그램·틱톡 주소만 넣을 수 있습니다." },
          { status: 400 }
        );
      }
      sourceUrl = input.url;
      title = input.title?.trim() || `링크 영상 ${new Date().toLocaleDateString("ko-KR")}`;
    } else {
      const prefix = `uploads/${session.user.id}/`;
      if (!input.path?.startsWith(prefix) || !resolveSafe(input.path)) {
        return NextResponse.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
      }
      if (!fs.existsSync(toAbsolute(input.path))) {
        return NextResponse.json({ error: "업로드한 파일을 찾을 수 없습니다." }, { status: 400 });
      }
      sourcePath = input.path;
    }
  }

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      kind: tool.id,
      title: title.slice(0, 200),
      sourceType: sourceUrl ? "link" : "upload",
      sourceUrl,
      sourcePath,
      optionsJson: JSON.stringify(optionsParsed.data),
      status: "queued",
      stage: "대기열에 올렸습니다",
    },
  });

  await prisma.job.create({ data: { projectId: project.id, type: tool.id } });

  return NextResponse.json({ id: project.id });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { outputs: true } } },
  });

  return NextResponse.json({ projects });
}
