import path from "node:path";
import fs from "node:fs";

/** 원본/산출물이 저장되는 루트. 기본은 레포 안의 storage/ (gitignore 됨) */
export function storageRoot(): string {
  const dir = process.env.STORAGE_DIR || "./storage";
  return path.resolve(process.cwd(), dir);
}

export function projectDir(projectId: string): string {
  return path.join(storageRoot(), "projects", projectId);
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** storage 루트 기준 상대경로로 바꾼다. DB에는 항상 상대경로만 저장한다. */
export function toRelative(absolute: string): string {
  return path.relative(storageRoot(), absolute).split(path.sep).join("/");
}

export function toAbsolute(relative: string): string {
  return path.join(storageRoot(), relative);
}

/**
 * /api/media 로 들어온 경로가 storage 밖을 가리키지 않는지 확인한다.
 * (../ 를 섞은 경로 탈출 방지)
 */
export function resolveSafe(relative: string): string | null {
  const root = storageRoot();
  const abs = path.resolve(root, relative);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}
