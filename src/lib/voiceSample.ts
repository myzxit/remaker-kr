import { spawn } from "node:child_process";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

/**
 * 복제 엔진이 참고하기 좋은 길이.
 *
 * 직접 재 보니 차이가 뚜렷하다. 참고 음성이 9초일 때는 멀쩡한 길이의 문장도
 * 뭉개져 나왔고, 같은 대본을 27초짜리 참고 음성으로 읽히니 세 문장 모두
 * 또렷했다. 그래서 최소 10초를 요구하고, 화면에서는 20초 이상을 권한다.
 */
export const SAMPLE_MAX_SEC = 30;
export const SAMPLE_MIN_SEC = 10;
/** 이 정도는 되어야 안정적으로 닮는다. 안내 문구용. */
export const SAMPLE_GOOD_SEC = 20;

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    child.on("error", (err) =>
      reject(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error(`실행 파일을 찾을 수 없습니다: ${bin}`)
          : err
      )
    );
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(bin)} 실패\n${stderr}`))
    );
  });
}

export async function probeSeconds(file: string): Promise<number> {
  const out = await run(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const value = Number.parseFloat(out.trim());
  if (!Number.isFinite(value)) throw new Error("길이를 읽을 수 없습니다.");
  return value;
}

/**
 * 올린 파일에서 참고 음성을 떠낸다.
 *
 * 앞쪽 무음을 걷어내고, 음량을 고르게 맞춘 뒤, 24kHz 모노로 최대 30초를 자른다.
 * 복제 품질은 이 샘플이 얼마나 깨끗한지에 거의 전부 달려 있다.
 */
export async function extractVoiceSample(input: string, output: string): Promise<number> {
  await run(FFMPEG, [
    "-y",
    "-i", input,
    "-vn",
    "-af",
    [
      "highpass=f=80",
      // 앞쪽 무음 제거 — 참고 음성이 조용하게 시작하면 닮기 어렵다.
      "silenceremove=start_periods=1:start_silence=0.2:start_threshold=-45dB",
      "loudnorm=I=-18:LRA=11:TP=-2",
    ].join(","),
    "-ac", "1",
    "-ar", "24000",
    "-t", String(SAMPLE_MAX_SEC),
    "-c:a", "pcm_s16le",
    output,
  ]);

  const seconds = await probeSeconds(output);
  if (seconds < SAMPLE_MIN_SEC) {
    throw new Error(
      `말소리가 ${SAMPLE_MIN_SEC}초 이상 담긴 파일이어야 합니다. (추출된 길이 ${seconds.toFixed(1)}초)`
    );
  }
  return seconds;
}
