import fs from "node:fs";
import path from "node:path";
import type { Project } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { projectDir, ensureDir, toRelative, toAbsolute } from "../src/lib/paths";
import { getSubtitleStyle } from "../src/lib/subtitleStyles";
import {
  remakeOptions,
  dubOptions,
  extractOptions,
  shortsOptions,
  silenceOptions,
  commentOptions,
  policyOptions,
} from "../src/lib/tools";
import { defaultVoice } from "../src/lib/voices";
import {
  FFMPEG,
  FFPROBE,
  ensureBinary,
  extractAudio,
  extractThumbnail,
  probeDuration,
  probeVolume,
} from "./ffmpeg";
import { downloadYoutube, fetchYoutubeTitle } from "./download";
import { transcribe, type Transcript } from "./transcribe";
import { buildScript, assignClips } from "./script";
import { synthesize, synthesizeCloned } from "./tts";
import { buildCaptions, captionMaxChars } from "./subtitles";
import { buildAudioTrack, makeWhoosh, renderRemake, getAspect } from "./remake";
import {
  pickHighlights,
  splitLongSegments,
  speechClips,
  groupCues,
  retimeCues,
  totalLength,
  autoCount,
} from "./highlights";
import { renderCuts } from "./cut";
import { renderCommentCard } from "./comment";
import { analyzeTranscript } from "./policy";

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

/**
 * 목소리를 골라 대본을 읽는다.
 *
 * "custom:<id>" 는 파일에서 떠낸 목소리다. 그 경우 복제 엔진으로 넘기고,
 * 아니면 기본 목소리(edge-tts)를 쓴다. 어느 쪽이든 결과 모양이 같아서
 * 뒤따르는 자막·화면 배정은 신경 쓸 게 없다.
 */
async function synthesizeVoice(opts: {
  sentences: string[];
  voice: string;
  rate: number;
  language: string;
  userId: string;
  workDir: string;
  onStage?: (stage: string) => void;
}) {
  if (!opts.voice.startsWith("custom:")) {
    return synthesize({
      sentences: opts.sentences,
      voice: opts.voice,
      rate: opts.rate,
      workDir: opts.workDir,
    });
  }

  const profileId = opts.voice.slice("custom:".length);
  const profile = await prisma.voiceProfile.findFirst({
    where: { id: profileId, userId: opts.userId },
  });
  if (!profile) throw new Error("고른 목소리를 찾을 수 없습니다.");
  if (!profile.consent) {
    throw new Error("이 목소리는 사용 확인이 되어 있지 않습니다. 목소리 보관함에서 다시 등록해 주세요.");
  }

  const samplePath = toAbsolute(profile.samplePath);
  if (!fs.existsSync(samplePath)) throw new Error("참고 음성 파일이 없습니다.");

  return synthesizeCloned({
    sentences: opts.sentences,
    voice: { samplePath, language: profile.language || opts.language, engine: profile.engine },
    workDir: opts.workDir,
    onProgress: (done, total) =>
      opts.onStage?.(`복제한 목소리로 읽는 중 ${done}/${total}문장`),
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

  // 복제 목소리는 한두 어절짜리 줄에서 엉뚱한 소리를 낸다. 미리 합쳐 둔다.
  const isCloned = opts.voice.startsWith("custom:");
  const script = buildScript(transcript.segments, {
    targetSec: opts.targetSec,
    mode: opts.scriptMode,
    rate: opts.rate,
    minChars: isCloned ? 16 : 0,
  });
  await setStatus(project.id, { scriptJson: JSON.stringify(script) });

  // 4. 새 목소리
  await setStatus(project.id, { status: "voicing", progress: 55, stage: "새 목소리로 읽는 중" });

  const narration = await synthesizeVoice({
    sentences: script.lines.map((l) => l.text),
    voice: opts.voice,
    rate: opts.rate,
    language: opts.language,
    userId: project.userId,
    workDir,
    onStage: (stage) => {
      void setStatus(project.id, { stage }).catch(() => {});
    },
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

// ─── 공통: 원본 확보 + 받아 적기 ───────────────────────────────────────────

/** 숏폼·무음 제거·정책 점검이 모두 "원본을 받아 적는" 데서 시작한다. */
async function sourceAndTranscript(
  project: Project,
  workDir: string,
  opts: { minSec: number }
): Promise<{ sourceAbs: string; duration: number; transcript: Transcript }> {
  const sourceAbs = await ensureSource(project, workDir);
  const duration = await probeDuration(sourceAbs);
  if (duration < opts.minSec) {
    throw new Error(`영상이 너무 짧습니다. ${opts.minSec}초 이상 영상을 넣어 주세요.`);
  }

  await setStatus(project.id, {
    sourcePath: toRelative(sourceAbs),
    durationSec: Math.round(duration),
    status: "transcribing",
    progress: 15,
    stage: "원본에서 말을 받아 적는 중",
  });

  const audioPath = path.join(workDir, "source.wav");
  await extractAudio(sourceAbs, audioPath);

  const transcript = await transcribe(audioPath, workDir, (sec) => {
    const ratio = Math.min(1, sec / Math.max(duration, 1));
    void setStatus(project.id, {
      progress: 15 + Math.round(ratio * 35),
      stage: `말 받아 적는 중 ${Math.round(ratio * 100)}%`,
    }).catch(() => {});
  });

  await setStatus(project.id, { transcriptJson: JSON.stringify(transcript) });
  return { sourceAbs, duration, transcript };
}

// ─── 숏폼 만들기 ───────────────────────────────────────────────────────────

export async function runShorts(project: Project): Promise<void> {
  await ensureBinary(FFMPEG, "ffmpeg 를 설치하세요.");
  await ensureBinary(FFPROBE, "ffprobe 를 설치하세요.");

  const dir = ensureDir(projectDir(project.id));
  const workDir = ensureDir(path.join(dir, "work"));
  const outDir = ensureDir(path.join(dir, "out"));

  const opts = shortsOptions.parse(parseOptions(project));
  if (opts.maxSec <= opts.minSec) throw new Error("최대 길이는 최소 길이보다 길어야 합니다.");

  const { sourceAbs, duration, transcript } = await sourceAndTranscript(project, workDir, {
    minSec: 30,
  });

  await setStatus(project.id, { status: "scripting", progress: 52, stage: "쓸 만한 구간을 고르는 중" });

  const count = opts.count > 0 ? opts.count : autoCount(duration);
  // 받아 적기가 긴 덩어리로 주면 하이라이트가 "앞 절반" 식으로만 잡힌다. 먼저 쪼갠다.
  const segments = splitLongSegments(transcript.segments);
  const highlights = pickHighlights(segments, {
    count,
    minSec: opts.minSec,
    maxSec: opts.maxSec,
  });

  const style = getSubtitleStyle(opts.subtitleStyle);
  const aspect = getAspect(opts.aspect);
  const maxChars = captionMaxChars(style, aspect.width, aspect.height);

  await setStatus(project.id, { status: "rendering", progress: 58, stage: "숏폼 만드는 중" });

  for (const [i, highlight] of highlights.entries()) {
    const base = 58 + Math.round((i / highlights.length) * 38);
    await setStatus(project.id, {
      progress: base,
      stage: `숏폼 만드는 중 ${i + 1}/${highlights.length}`,
    });

    // 무음 제거를 켜면 구간 안의 빈 공간까지 걷어낸다.
    const clips = opts.removeSilence
      ? speechClips(highlight.segments, {
          thresholdSec: 0.6,
          padSec: 0.12,
          limitStart: highlight.start,
          limitEnd: highlight.end,
        })
      : [{ start: highlight.start, end: highlight.end }];

    if (clips.length === 0) continue;

    const cues = retimeCues(groupCues(highlight.segments, { maxChars }), clips);
    const result = await renderCuts({
      sourcePath: sourceAbs,
      clips,
      captions: cues,
      style,
      aspectId: opts.aspect,
      burnSubtitles: true,
      outDir,
      fileBase: `short-${i + 1}`,
    });

    const thumbPath = path.join(outDir, `short-${i + 1}-thumb.jpg`);
    await extractThumbnail(result.videoPath, thumbPath, Math.min(1.5, result.durationSec / 2));

    await addOutput(project.id, {
      index: i + 1,
      title: highlight.title || `${project.title} ${i + 1}`,
      filePath: toRelative(result.videoPath),
      thumbPath: toRelative(thumbPath),
      meta: {
        durationSec: Math.round(result.durationSec),
        sourceStartSec: Math.round(highlight.start),
        sourceEndSec: Math.round(highlight.end),
        score: highlight.score,
        labels: highlight.labels,
        resolution: `${aspect.width}x${aspect.height}`,
      },
    });
  }

  await setStatus(project.id, { status: "done", progress: 100, stage: null, error: null });
}

// ─── 무음 제거 ─────────────────────────────────────────────────────────────

export async function runSilence(project: Project): Promise<void> {
  await ensureBinary(FFMPEG, "ffmpeg 를 설치하세요.");
  await ensureBinary(FFPROBE, "ffprobe 를 설치하세요.");

  const dir = ensureDir(projectDir(project.id));
  const workDir = ensureDir(path.join(dir, "work"));
  const outDir = ensureDir(path.join(dir, "out"));

  const opts = silenceOptions.parse(parseOptions(project));
  const { sourceAbs, duration, transcript } = await sourceAndTranscript(project, workDir, {
    minSec: 10,
  });

  await setStatus(project.id, { status: "rendering", progress: 55, stage: "빈 구간을 걷어내는 중" });

  const clips = speechClips(transcript.segments, {
    thresholdSec: opts.thresholdSec,
    padSec: opts.padSec,
    limitEnd: duration,
  });
  if (clips.length === 0) throw new Error("남길 말소리를 찾지 못했습니다.");

  const kept = totalLength(clips);
  if (kept > duration - 0.5) {
    throw new Error("잘라낼 만한 빈 구간이 없습니다. 기준 시간을 줄여 보세요.");
  }

  const style = getSubtitleStyle(opts.subtitleStyle);
  const cues = retimeCues(
    groupCues(transcript.segments, { maxChars: captionMaxChars(style, 1920, 1080) }),
    clips
  );

  const result = await renderCuts({
    sourcePath: sourceAbs,
    clips,
    captions: cues,
    style,
    burnSubtitles: opts.burnSubtitles,
    outDir,
    fileBase: "tightened",
    onProgress: (sec) => {
      const ratio = Math.min(1, sec / Math.max(kept, 1));
      void setStatus(project.id, {
        progress: 55 + Math.round(ratio * 42),
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
      sourceDurationSec: Math.round(duration),
      removedSec: Math.round(duration - result.durationSec),
      cuts: clips.length,
    },
  });

  await setStatus(project.id, { status: "done", progress: 100, stage: null, error: null });
}

// ─── 댓글 이미지 ───────────────────────────────────────────────────────────

export async function runComment(project: Project): Promise<void> {
  await ensureBinary(FFMPEG, "ffmpeg 를 설치하세요.");

  const dir = ensureDir(projectDir(project.id));
  const outDir = ensureDir(path.join(dir, "out"));
  const opts = commentOptions.parse(parseOptions(project));

  await setStatus(project.id, { status: "rendering", progress: 40, stage: "댓글 카드를 그리는 중" });

  const card = await renderCommentCard({
    nickname: opts.nickname,
    body: opts.body,
    likes: opts.likes,
    theme: opts.theme,
    outDir,
    fileBase: "comment",
  });

  await addOutput(project.id, {
    index: 1,
    title: project.title,
    kind: "image",
    filePath: toRelative(card.imagePath),
    thumbPath: toRelative(card.imagePath),
    meta: {
      width: card.width,
      height: card.height,
      lines: card.lines,
      theme: opts.theme,
    },
  });

  await setStatus(project.id, { status: "done", progress: 100, stage: null, error: null });
}

// ─── 정책 사전 점검 ────────────────────────────────────────────────────────

export async function runPolicy(project: Project): Promise<void> {
  await ensureBinary(FFMPEG, "ffmpeg 를 설치하세요.");
  await ensureBinary(FFPROBE, "ffprobe 를 설치하세요.");

  const dir = ensureDir(projectDir(project.id));
  const workDir = ensureDir(path.join(dir, "work"));
  const outDir = ensureDir(path.join(dir, "out"));

  policyOptions.parse(parseOptions(project));

  const { sourceAbs, duration, transcript } = await sourceAndTranscript(project, workDir, {
    minSec: 5,
  });

  await setStatus(project.id, { status: "rendering", progress: 70, stage: "표현과 형식을 훑는 중" });

  const volume = await probeVolume(sourceAbs);
  const report = analyzeTranscript(transcript, {
    durationSec: duration,
    meanVolumeDb: volume.meanDb,
    maxVolumeDb: volume.maxDb,
  });

  // 결과를 파일로도 남긴다. 화면에서 지워도 내려받아 볼 수 있게.
  const reportPath = path.join(outDir, "policy.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  const thumbPath = path.join(outDir, "thumb.jpg");
  await extractThumbnail(sourceAbs, thumbPath, Math.min(3, duration / 2));

  await addOutput(project.id, {
    index: 1,
    title: `${project.title} 점검 결과`,
    kind: "report",
    filePath: toRelative(reportPath),
    thumbPath: toRelative(thumbPath),
    meta: report,
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
    case "shorts":
      return runShorts(project);
    case "silence":
      return runSilence(project);
    case "comment":
      return runComment(project);
    case "policy":
      return runPolicy(project);
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
