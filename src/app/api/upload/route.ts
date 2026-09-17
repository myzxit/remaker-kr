import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { auth } from "@/lib/auth";
import { ensureDir, storageRoot, toRelative } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_BYTES = 6 * 1024 * 1024 * 1024; // 6GB
const ALLOWED = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".3gp", ".mpg", ".mpeg"]);

/**
 * 파일을 본문 그대로 받는다(PUT).
 * 멀티파트를 쓰지 않아서 파서가 필요 없고, 큰 파일도 메모리에 올리지 않고 흘려 쓴다.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "video.mp4";
  const ext = path.extname(name).toLowerCase();

  if (!ALLOWED.has(ext)) {
    return NextResponse.json(
      { error: `지원하지 않는 형식입니다: ${ext || "확장자 없음"}` },
      { status: 415 }
    );
  }

  const declared = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (declared > MAX_BYTES) {
    return NextResponse.json({ error: "파일이 너무 큽니다 (6GB 초과)." }, { status: 413 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "본문이 비어 있습니다." }, { status: 400 });
  }

  const dir = ensureDir(path.join(storageRoot(), "uploads", session.user.id));
  const target = path.join(dir, `${crypto.randomUUID()}${ext}`);

  try {
    await pipeline(Readable.fromWeb(request.body as never), fs.createWriteStream(target));
  } catch (err) {
    fs.rmSync(target, { force: true });
    return NextResponse.json({ error: `업로드 실패: ${(err as Error).message}` }, { status: 500 });
  }

  return NextResponse.json({ path: toRelative(target), name, size: fs.statSync(target).size });
}
