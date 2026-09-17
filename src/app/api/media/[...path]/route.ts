import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSafe } from "@/lib/paths";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

/**
 * 결과물 내보내기.
 *
 * storage 는 public 이 아니다. 경로만 안다고 열리지 않도록, 이 파일이 정말
 * 이 사용자의 결과물(또는 보관함 자산)인지 DB 로 확인한 뒤에만 읽는다.
 * Range 를 지원해야 브라우저에서 영상 탐색이 된다.
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { path: segments } = await params;
  const relative = segments.map(decodeURIComponent).join("/");

  const owned =
    (await prisma.output.findFirst({
      where: {
        project: { userId: session.user.id },
        OR: [{ filePath: relative }, { thumbPath: relative }],
      },
      select: { id: true },
    })) ??
    (await prisma.asset.findFirst({
      where: { userId: session.user.id, filePath: relative },
      select: { id: true },
    }));

  if (!owned) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });

  const abs = resolveSafe(relative);
  if (!abs || !fs.existsSync(abs)) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const stat = fs.statSync(abs);
  const type = MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
  const range = request.headers.get("range");

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m?.[1] ? Number.parseInt(m[1], 10) : 0;
    const end = Math.min(m?.[2] ? Number.parseInt(m[2], 10) : stat.size - 1, stat.size - 1);

    if (Number.isNaN(start) || start >= stat.size) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }

    const stream = fs.createReadStream(abs, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const stream = fs.createReadStream(abs);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
