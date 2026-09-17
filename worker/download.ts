import fs from "node:fs";
import path from "node:path";
import { run } from "./ffmpeg";

const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return YOUTUBE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 유튜브 링크에서 영상을 내려받는다.
 * 1080p 이하 mp4 를 우선 받고, 없으면 최선의 포맷을 받아 mp4 로 합친다.
 */
export async function downloadYoutube(url: string, destDir: string): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });
  const outputTemplate = path.join(destDir, "source.%(ext)s");

  await run(YTDLP, [
    "--no-playlist",
    "--no-progress",
    "--retries",
    "3",
    "--merge-output-format",
    "mp4",
    "-f",
    "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]/best",
    "-o",
    outputTemplate,
    url,
  ]);

  const file = fs
    .readdirSync(destDir)
    .filter((name) => name.startsWith("source."))
    .map((name) => path.join(destDir, name))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];

  if (!file) throw new Error("영상을 내려받지 못했습니다.");
  return file;
}

/** 유튜브 제목을 미리 가져와 프로젝트 이름으로 쓴다. 실패해도 파이프라인은 계속 간다. */
export async function fetchYoutubeTitle(url: string): Promise<string | null> {
  try {
    const { stdout } = await run(YTDLP, ["--no-playlist", "--skip-download", "--print", "%(title)s", url]);
    const title = stdout.trim().split("\n")[0];
    return title || null;
  } catch {
    return null;
  }
}
