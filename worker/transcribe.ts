import fs from "node:fs";
import path from "node:path";
import { run } from "./ffmpeg";

const PYTHON = process.env.PYTHON_PATH || "python3";

export type Word = { start: number; end: number; word: string };
export type Segment = { start: number; end: number; text: string; words: Word[] };
export type Transcript = { language: string; duration: number; segments: Segment[] };

/** worker/transcribe.py 를 호출해 자막 세그먼트를 얻는다. */
export async function transcribe(
  audioPath: string,
  workDir: string,
  onProgress?: (seconds: number) => void
): Promise<Transcript> {
  const output = path.join(workDir, "transcript.json");

  await run(
    PYTHON,
    [
      path.join(process.cwd(), "worker", "transcribe.py"),
      "--input",
      audioPath,
      "--output",
      output,
      "--model",
      process.env.WHISPER_MODEL || "small",
      "--device",
      process.env.WHISPER_DEVICE || "cpu",
      "--compute-type",
      process.env.WHISPER_COMPUTE_TYPE || "int8",
      "--language",
      process.env.WHISPER_LANGUAGE ?? "ko",
    ],
    {
      onStderr: (chunk) => {
        for (const line of chunk.split("\n")) {
          const match = /^progress ([\d.]+)/.exec(line.trim());
          if (match) onProgress?.(Number.parseFloat(match[1]));
        }
      },
    }
  );

  const parsed = JSON.parse(fs.readFileSync(output, "utf-8")) as Transcript;
  if (!parsed.segments?.length) {
    throw new Error("음성을 인식하지 못했습니다. 말소리가 없는 영상일 수 있습니다.");
  }
  return parsed;
}
