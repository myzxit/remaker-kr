/**
 * 도구 하나를 워커 경로 그대로 돌려 본다.
 *
 *   npx tsx scripts/test-tool.ts shorts  [원본영상경로]
 *   npx tsx scripts/test-tool.ts silence [원본영상경로]
 *   npx tsx scripts/test-tool.ts policy  [원본영상경로]
 *   npx tsx scripts/test-tool.ts comment
 *
 * 웹 화면 없이 runProject 를 직접 부릅니다. 옵션은 기본값을 쓰되,
 * 세 번째 인자로 JSON 을 주면 덮어씁니다.
 */

import { loadEnv } from "../worker/env";

loadEnv();

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { toRelative, storageRoot } from "../src/lib/paths";
import { runProject } from "../worker/pipeline";
import { NEEDS_SOURCE, OPTION_SCHEMAS } from "../src/lib/tools";
import { probeDuration } from "../worker/ffmpeg";

const DEFAULTS: Record<string, Record<string, unknown>> = {
  shorts: { count: 2, minSec: 15, maxSec: 40, aspect: "9:16", subtitleStyle: "pop", removeSilence: true },
  silence: { thresholdSec: 0.5, padSec: 0.12, burnSubtitles: true, subtitleStyle: "clean" },
  policy: {},
  comment: {
    nickname: "편집하는곰",
    body: "이 부분 진짜 공감돼요. 저도 처음엔 컷 편집만 며칠 붙잡고 있었는데, 결국 중요한 건 첫 3초더라고요.",
    likes: 2431,
    theme: "dark",
  },
};

async function main() {
  const kind = process.argv[2];
  if (!kind || !DEFAULTS[kind]) {
    throw new Error(`도구를 지정하세요: ${Object.keys(DEFAULTS).join(" | ")}`);
  }

  const options = { ...DEFAULTS[kind], ...(process.argv[4] ? JSON.parse(process.argv[4]) : {}) };
  OPTION_SCHEMAS[kind].parse(options); // 웹에서 거치는 검증을 여기서도 거친다

  let sourcePath: string | null = null;
  if (NEEDS_SOURCE.has(kind)) {
    const input = path.resolve(process.argv[3] ?? "storage/testsrc/original.mp4");
    if (!fs.existsSync(input)) throw new Error(`원본이 없습니다: ${input}`);
    if (!input.startsWith(storageRoot())) throw new Error("원본은 storage/ 아래에 있어야 합니다.");
    console.log("원본:", input, `(${(await probeDuration(input)).toFixed(1)}초)`);
    sourcePath = toRelative(input);
  }

  const user = await prisma.user.upsert({
    where: { email: "test@remaker.local" },
    update: {},
    create: { email: "test@remaker.local", name: "테스트", role: "admin" },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      kind,
      title: `${kind} 점검`,
      sourceType: sourcePath ? "upload" : "upload",
      sourcePath,
      optionsJson: JSON.stringify(options),
    },
  });

  const started = Date.now();
  await runProject(project.id);

  const done = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    include: { outputs: { orderBy: { index: "asc" } } },
  });

  console.log(`\n상태: ${done.status} (${((Date.now() - started) / 1000).toFixed(0)}초 소요)`);
  for (const out of done.outputs) {
    const abs = path.join(storageRoot(), out.filePath ?? "");
    console.log(`\n[${out.index}] ${out.title} (${out.kind})`);
    console.log(`  파일: ${abs}`);
    if (fs.existsSync(abs)) {
      console.log(`  용량: ${(fs.statSync(abs).size / 1024).toFixed(0)}KB`);
      if (out.kind === "video") console.log(`  실제 길이: ${(await probeDuration(abs)).toFixed(1)}초`);
    } else {
      console.log("  ⚠ 파일 없음");
    }
    console.log(`  meta: ${String(out.meta).slice(0, 600)}`);
  }
}

main()
  .catch((err) => {
    console.error("\n실패:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
