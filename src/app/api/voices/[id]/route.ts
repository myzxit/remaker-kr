import { NextResponse } from "next/server";
import fs from "node:fs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSafe } from "@/lib/paths";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const voice = await prisma.voiceProfile.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!voice) return NextResponse.json({ error: "없는 목소리입니다." }, { status: 404 });

  await prisma.voiceProfile.delete({ where: { id } });

  const abs = resolveSafe(voice.samplePath);
  if (abs) fs.rmSync(abs, { force: true });

  return NextResponse.json({ ok: true });
}
