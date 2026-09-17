import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureDir, storageRoot, toRelative } from "@/lib/paths";
import { extractVoiceSample } from "@/lib/voiceSample";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED = new Set([
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
  ".mp4", ".mov", ".mkv", ".webm",
]);

/** 한 사람이 목소리를 무한정 쌓지 않도록. */
const MAX_VOICES = 10;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const voices = await prisma.voiceProfile.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      sampleSec: true,
      sourceName: true,
      language: true,
      engine: true,
      consent: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ voices });
}

/**
 * 파일에서 목소리를 떠낸다.
 *
 * 파일을 본문 그대로 받아(PUT) 저장한 뒤, 말소리만 골라 참고 음성을 만든다.
 * 원본 파일은 샘플을 뽑고 나면 지운다 — 보관할 이유가 없다.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim();
  const sourceName = url.searchParams.get("source") || null;
  const language = url.searchParams.get("language") || "ko";
  const consent = url.searchParams.get("consent") === "1";

  if (!name) return NextResponse.json({ error: "목소리 이름을 입력해 주세요." }, { status: 400 });
  if (!consent) {
    return NextResponse.json(
      { error: "본인 목소리이거나 사용 허락을 받았다는 확인이 필요합니다." },
      { status: 400 }
    );
  }

  const count = await prisma.voiceProfile.count({ where: { userId: session.user.id } });
  if (count >= MAX_VOICES) {
    return NextResponse.json(
      { error: `목소리는 최대 ${MAX_VOICES}개까지 저장됩니다. 쓰지 않는 것을 지워 주세요.` },
      { status: 409 }
    );
  }

  const ext = path.extname(sourceName || ".wav").toLowerCase() || ".wav";
  if (!ALLOWED.has(ext)) {
    return NextResponse.json({ error: `지원하지 않는 형식입니다: ${ext}` }, { status: 415 });
  }

  const declared = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다 (500MB 초과)." }, { status: 413 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "본문이 비어 있습니다." }, { status: 400 });
  }

  const dir = ensureDir(path.join(storageRoot(), "voices", session.user.id));
  const id = crypto.randomUUID();
  const rawPath = path.join(dir, `${id}-raw${ext}`);
  const samplePath = path.join(dir, `${id}.wav`);

  try {
    await pipeline(Readable.fromWeb(request.body as never), fs.createWriteStream(rawPath));
    const sampleSec = await extractVoiceSample(rawPath, samplePath);

    const voice = await prisma.voiceProfile.create({
      data: {
        userId: session.user.id,
        name: name.slice(0, 40),
        samplePath: toRelative(samplePath),
        sampleSec,
        sourceName: sourceName?.slice(0, 140) ?? null,
        language,
        engine: "xtts",
        consent: true,
      },
    });

    return NextResponse.json({
      id: voice.id,
      name: voice.name,
      sampleSec: Number(sampleSec.toFixed(1)),
    });
  } catch (err) {
    fs.rmSync(samplePath, { force: true });
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  } finally {
    // 참고 음성만 남기고 원본은 버린다.
    fs.rmSync(rawPath, { force: true });
  }
}
