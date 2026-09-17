import { NextResponse } from "next/server";
import fs from "node:fs";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSafe } from "@/lib/paths";

export const runtime = "nodejs";

/**
 * 저장한 참고 음성 들어보기.
 *
 * 길어야 30초짜리 wav 라서 통째로 내려 준다. 본인 것만 열린다.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const voice = await prisma.voiceProfile.findFirst({
    where: { id, userId: session.user.id },
    select: { samplePath: true },
  });
  if (!voice) return NextResponse.json({ error: "없는 목소리입니다." }, { status: 404 });

  const abs = resolveSafe(voice.samplePath);
  if (!abs || !fs.existsSync(abs)) {
    return NextResponse.json({ error: "참고 음성 파일이 없습니다." }, { status: 404 });
  }

  const stat = fs.statSync(abs);
  return new NextResponse(Readable.toWeb(fs.createReadStream(abs)) as ReadableStream, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
