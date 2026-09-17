/**
 * 재구성 파이프라인 점검.
 *
 *   npx tsx scripts/test-remake.ts [원본영상경로]
 *
 * 웹 화면 없이 워커 경로만 그대로 태워 본다. 원본을 넣으면
 * 받아적기 → 새 대본 → 새 목소리 → 화면 재배치 → 자막 굽기까지 돈다.
 */

import { loadEnv } from "../worker/env";

loadEnv();

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { toRelative, storageRoot } from "../src/lib/paths";
import { runRemake } from "../worker/pipeline";
import { probeDuration } from "../worker/ffmpeg";

async function main() {
  const input = path.resolve(process.argv[2] ?? "storage/testsrc/original.mp4");
  if (!fs.existsSync(input)) throw new Error(`원본이 없습니다: ${input}`);
  if (!input.startsWith(storageRoot())) {
    throw new Error("원본은 storage/ 아래에 있어야 합니다.");
  }

  console.log("원본:", input, `(${(await probeDuration(input)).toFixed(1)}초)`);

  const user = await prisma.user.upsert({
    where: { email: "test@remaker.local" },
    update: {},
    create: { email: "test@remaker.local", name: "테스트", role: "admin" },
  });

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      kind: "remake",
      title: "재구성 점검",
      sourceType: "upload",
      sourcePath: toRelative(input),
      optionsJson: JSON.stringify({
        targetSec: 60,
        language: "ko",
        voice: "ko-KR-SunHiNeural",
        rate: 0,
        aspect: "9:16",
        subtitleCleanup: "cover",
        subtitleStyle: "pop",
        burnSubtitles: true,
        sfx: true,
        scriptMode: "condense",
      }),
    },
  });

  const started = Date.now();
  await runRemake(project);

  const done = await prisma.project.findUniqueOrThrow({
    where: { id: project.id },
    include: { outputs: true },
  });
  const script = JSON.parse(done.scriptJson || "{}");

  console.log(`\n상태: ${done.status} (${((Date.now() - started) / 1000).toFixed(0)}초 소요)`);
  console.log(`새 대본 ${script.lines?.length ?? 0}문장, 예상 ${script.estimatedSec}초`);
  for (const line of (script.lines ?? []).slice(0, 4)) {
    console.log(`  · ${line.text}`);
  }
  for (const out of done.outputs) {
    const abs = path.join(storageRoot(), out.filePath ?? "");
    console.log(`\n결과: ${abs}`);
    console.log(`  meta: ${out.meta}`);
    if (fs.existsSync(abs)) {
      console.log(`  실제 길이: ${(await probeDuration(abs)).toFixed(1)}초`);
      console.log(`  용량: ${(fs.statSync(abs).size / 1024 / 1024).toFixed(1)}MB`);
    }
  }
}

main()
  .catch((err) => {
    console.error("\n실패:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
