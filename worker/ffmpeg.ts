import { spawn } from "node:child_process";

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export type RunResult = { stdout: string; stderr: string };

/** 외부 바이너리를 실행하고 종료코드가 0이 아니면 stderr 를 담아 throw 한다. */
export function run(
  bin: string,
  args: string[],
  opts: { onStderr?: (chunk: string) => void } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      const text = d.toString();
      stderr += text;
      // ffmpeg 로그는 길어서 뒤쪽만 남긴다.
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      opts.onStderr?.(text);
    });

    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`실행 파일을 찾을 수 없습니다: ${bin}`));
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} 종료 코드 ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

export async function ensureBinary(bin: string, hint: string): Promise<void> {
  try {
    await run(bin, ["-version"]);
  } catch {
    throw new Error(`${bin} 을(를) 실행할 수 없습니다. ${hint}`);
  }
}

/** 영상 길이(초). ffprobe 가 실패하면 throw. */
export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await run(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const value = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(value)) throw new Error("영상 길이를 읽을 수 없습니다.");
  return value;
}

/**
 * 음량 측정 (평균 / 최대, dB).
 *
 * `volumedetect` 는 통계를 stderr 로 뱉는다. 소리 트랙이 없으면 숫자가 없으므로
 * null 을 돌려 주고, 부르는 쪽에서 "측정 못 함"으로 다룬다.
 */
export async function probeVolume(
  file: string
): Promise<{ meanDb: number | null; maxDb: number | null }> {
  const { stderr } = await run(FFMPEG, [
    "-i", file,
    "-vn",
    "-af", "volumedetect",
    "-f", "null",
    "-",
  ]);

  const pick = (key: string) => {
    const m = new RegExp(`${key}:\\s*(-?\\d+(?:\\.\\d+)?) dB`).exec(stderr);
    return m ? Number(m[1]) : null;
  };

  return { meanDb: pick("mean_volume"), maxDb: pick("max_volume") };
}

/** 음성 인식용 16kHz 모노 wav 추출 */
export async function extractAudio(input: string, output: string): Promise<void> {
  await run(FFMPEG, [
    "-y",
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    output,
  ]);
}

export async function extractThumbnail(
  input: string,
  output: string,
  atSec: number
): Promise<void> {
  await run(FFMPEG, [
    "-y",
    "-ss",
    atSec.toFixed(3),
    "-i",
    input,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    output,
  ]);
}

/** ffmpeg 필터 그래프에서 특수문자로 쓰이는 값들을 이스케이프 */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%");
}
