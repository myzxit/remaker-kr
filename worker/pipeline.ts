import fs from "node:fs";
import path from "node:path";
import type { Project } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { projectDir, ensureDir, toRelative, toAbsolute } from "../src/lib/paths";
import { getSubtitleStyle } from "../src/lib/subtitleStyles";
import { remakeOptions, dubOptions, extractOptions } from "../src/lib/tools";
import { defaultVoice } from "../src/lib/voices";
import { FFMPEG, FFPROBE, ensureBinary, extractAudio, extractThumbnail, probeDuration } from "./ffmpeg";
import { downloadYoutube, fetchYoutubeTitle } from "./download";
import { transcribe, type Transcript } from "./transcribe";
import { buildScript, assignClips } from "./script";
import { synthesize } from "./tts";
import { buildCaptions, captionMaxChars } from "./subtitles";
import { buildAudioTrack, makeWhoosh, renderRemake, getAspect } from "./remake";

const setStatus = (id: string, data: Record<string, unknown>) =>
  prisma.project.update({ where: { id }, data });

const parseOptions = (project: Project) => JSON.parse(project.optionsJson || "{}");

/** 원본 확보 — 링크면 받아오고, 업로드면 경로를 확인한다. */
async function ensureSource(project: Project, workDir: string): Promise<string> {
  if (project.sourceType === "link") {
    if (!project.sourceUrl) throw new Error("주소가 비어 있습니다.");
    await setStatus(project.id, { status: "fetching", progress: 5, stage: "원본 영상을 가져오는 중" });

    const file = await downloadYoutube(project.sourceUrl, workDir);
    const title = await fetchYoutubeTitle(project.sourceUrl);
    if (title && project.title.startsWith("링크 영상")) {
      await setStatus(project.id, { title: title.slice(0, 140) });
    }
    return file;
  }

  if (!project.sourcePath) throw new Error("업로드한 파일을 찾을 수 없습니다.");
  const abs = toAbsolute(project.sourcePath);
  if (!fs.existsSync(abs)) throw new Error("업로드한 파일이 저장소에 없습니다.");
  return abs;
}

async function addOutput(
  projectId: string,
  data: { index: number; title: string; kind?: string; filePath?: string; thumbPath?: string; meta?: unknown }
) {
  await prisma.output.create({
    data: {
      projectId,
      index: data.index,
      title: data.title,
      kind: data.kind ?? "video",
      filePath: data.filePath ?? null,
      thumbPath: data.thumbPath ?? null,
      meta: data.meta ? JSON.stringify(data.meta) : null,
      status: "done",
    },
  });
}

// ─── 영상 재구성 (핵심) ────────────────────────────────────────────────────

/**
 * 목소리·효과음·자막을 전부 새로 입힌다.
 *
 * dub 도구도 이 함수를 쓴다. 다른 점은 "원본을 요약하지 않고 그대로 읽는다"와
 * "원본 자막 영역을 건드리지 않는다" 뿐이라, 옵션만 바꿔 넘긴다.
 */
export async function runRemake(project: Project): Promise<void> {
  await ensureBinary(FFMPEG, "ffmpeg 를 설치하세요.");
  await ensureBinary(FFPROBE, "ffprobe 를 설치하세요.");

  const dir = ensureDir(projectDir(project.id));
  const workDir = ensureDir(path.join(dir, "work"));
  const outDir = ensureDir(path.join(dir, "out"));

  const isDub = project.kind === "dub";
  const raw = parseOptions(project);
  const opts = isDub
    ? (() => {
        const d = dubOptions.parse(raw);
        return {
          ...remakeOptions.parse({}),
          language: d.language,
          voice: d.voice || defaultVoice(d.language),
          rate: d.rate,
          burnSubtitles: d.burnSubtitles,
          subtitleStyle: d.subtitleStyle,
          subtitleCleanup: "none" as const,
          scriptMode: "faithful" as const,
          sfx: false,
          targetSec: 25 * 60,
        };
      })()
    : remakeOptions.parse(raw);

  // 1. 원본
  const sourceAbs = await ensureSource(project, workDir);
  const sourceDuration = await probeDuration(sourceAbs);
  if (sourceDuration < 10) throw new Error("영상이 너무 짧습니다. 10초 이상 영상을 넣어 주세요.");

  await setStatus(project.id, {
    sourcePath: toRelative(sourceAbs),
    durationSec: Math.round(sourceDuration),
  });

  // 2. 원본 음성 인식 — 무엇을 말하는지 알아야 새 대본을 쓸 수 있다
  await setStatus(project.id, {
    status: "transcribing",
    progress: 15,
    stage: "원본에서 말을 받아 적는 중",
  });

  const audioPath = path.join(workDir, "source.wav");
  await extractAudio(sourceAbs, audioPath);

  const transcript: Transcript = await transcribe(audioPath, workDir, (sec) => {
    const ratio = Math.min(1, sec / Math.max(sourceDuration, 1));
    void setStatus(project.id, {
      progress: 15 + Math.round(ratio * 30),
      stage: `말 받아 적는 중 ${Math.round(ratio * 100)}%`,
    }).catch(() => {});
  });

  await setStatus(project.id, { transcriptJson: JSON.stringify(transcript) });

  // 3. 새 대본
  await setStatus(project.id, { status: "scripting", progress: 48, stage: "새 대본을 쓰는 중" });

  const script = buildScript(transcript.segments, {
    targetSec: opts.targetSec,
    mode: opts.scriptMode,
    rate: opts.rate,
  });
  await setStatus(project.id, { scriptJson: JSON.stringify(script) });

  // 4. 새 목소리
  await setStatus(project.id, { status: "voicing", progress: 55, stage: "새 목소리로 읽는 중" });

  const narration = await synthesize({
    sentences: script.lines.map((l) => l.text),
    voice: opts.voice,
    rate: opts.rate,
    workDir,
  });

  // 5. 화면 배정 — 나레이션 길이에 맞춰 원본에서 그림을 떼어 온다
  await setStatus(project.id, { status: "rendering", progress: 65, stage: "화면을 다시 붙이는 중" });

  const clips = assignClips(narration.cues, script.lines, sourceDuration);

  const style = getSubtitleStyle(opts.subtitleStyle);
  const aspectBox = getAspect(opts.aspect);
  const captions = buildCaptions(
    narration.cues,
    captionMaxChars(style, aspectBox.width, aspectBox.height)
  );

  // 6. 오디오 트랙 (나레이션 + 효과음)
  const sfxPath = opts.sfx ? await makeWhoosh(path.join(workDir, "whoosh.wav")) : null;
  const sfxTimes = opts.sfx ? narration.cues.slice(1).map((c) => Math.max(0, c.start - 0.18)) : [];

  const trackPath = await buildAudioTrack({
    narrationPath: narration.audioPath,
    sfxTimes,
    sfxPath,
    outPath: path.join(workDir, "track.m4a"),
    durationSec: narration.durationSec,
  });

  // 7. 렌더
  const result = await renderRemake({
    sourcePath: sourceAbs,
    audioPath: trackPath,
    clips,
    captions,
    style,
    aspectId: opts.aspect,
    subtitleCleanup: opts.subtitleCleanup,
    burnSubtitles: opts.burnSubtitles,
    outDir,
    fileBase: isDub ? "dubbed" : "remake",
    durationSec: narration.durationSec,
    onProgress: (sec) => {
      const ratio = Math.min(1, sec / Math.max(narration.durationSec, 1));
      void setStatus(project.id, {
        progress: 65 + Math.round(ratio * 32),
        stage: `영상 만드는 중 ${Math.round(ratio * 100)}%`,
      }).catch(() => {});
    },
  });

  const thumbPath = path.join(outDir, "thumb.jpg");
  await extractThumbnail(result.videoPath, thumbPath, Math.min(2, result.durationSec / 2));

  await addOutput(project.id, {
    index: 1,
    title: project.title,
    filePath: toRelative(result.videoPath),
    thumbPath: toRelative(thumbPath),
    meta: {
      durationSec: Math.round(result.durationSec),
      lines: script.lines.length,
      voice: opts.voice,
      language: opts.language,
      resolution: `${aspectBox.width}x${aspectBox.height}`,
      sourceDurationSec: Math.round(sourceDuration),
    },
  });

  await setStatus(project.id, { status: "done", progress: 100, stage: null, error: null });
}

// ─── 영상 가져오기 ─────────────────────────────────────────────────────────

export async function runExtract(project: Project): Promise<void> {
  await ensureBinary(FFPROBE, "ffmpeg 를 설치하세요.");
  extractOptions.parse(parseOptions(project));

  const dir = ensureDir(projectDir(project.id));
  const outDir = ensureDir(path.join(dir, "out"));

  const sourceAbs = await ensureSource(project, outDir);
  const duration = await probeDuration(sourceAbs);

  const thumbPath = path.join(outDir, "thumb.jpg");
  await extractThumbnail(sourceAbs, thumbPath, Math.min(3, duration / 2));

  await setStatus(project.id, {
    sourcePath: toRelative(sourceAbs),
    durationSec: Math.round(duration),
  });

  await addOutput(project.id, {
    index: 1,
    title: project.title,
    filePath: toRelative(sourceAbs),
    thumbPath: toRelative(thumbPath),
    meta: { durationSec: Math.round(duration) },
  });

  // 보관함에도 넣어 다른 도구에서 바로 쓸 수 있게 한다.
  await prisma.asset.create({
    data: {
      userId: project.userId,
      kind: "video",
      name: project.title.slice(0, 140),
      filePath: toRelative(sourceAbs),
      sizeBytes: Math.min(fs.statSync(sourceAbs).size, 2_000_000_000),
      meta: JSON.stringify({ durationSec: Math.round(duration) }),
    },
  });

  await setStatus(project.id, { status: "done", progress: 100, stage: null, error: null });
}

// ─── 분기 ──────────────────────────────────────────────────────────────────

export async function runProject(projectId: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  switch (project.kind) {
    case "remake":
    case "dub":
      return runRemake(project);
    case "extract":
      return runExtract(project);
    default:
      throw new Error(`아직 지원하지 않는 도구입니다: ${project.kind}`);
  }
}

export async function failProject(projectId: string, message: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "failed", stage: null, error: String(message).slice(0, 1200) },
  });
}
