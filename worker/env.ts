import fs from "node:fs";
import path from "node:path";

/**
 * 값 하나를 읽는다. 따옴표로 감싼 값은 닫는 따옴표까지만 취하고,
 * 그 뒤에 붙은 인라인 주석(`WHISPER_DEVICE="cpu"  # cpu | cuda`)은 버린다.
 * 따옴표가 없으면 공백 뒤의 `#` 부터를 주석으로 본다.
 */
function parseValue(raw: string): string {
  const value = raw.trim();

  const quote = value[0];
  if (quote === '"' || quote === "'") {
    const closing = value.indexOf(quote, 1);
    if (closing !== -1) return value.slice(1, closing);
    return value.slice(1);
  }

  const comment = value.search(/\s#/);
  return (comment === -1 ? value : value.slice(0, comment)).trim();
}

/**
 * 워커는 Next.js 밖에서 도니 .env 를 직접 읽어야 한다.
 * 이미 프로세스에 있는 값은 덮어쓰지 않는다.
 */
export function loadEnv(files = [".env.local", ".env"]): void {
  for (const file of files) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;

    for (const rawLine of fs.readFileSync(full, "utf-8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eq = line.indexOf("=");
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;

      process.env[key] = parseValue(line.slice(eq + 1));
    }
  }
}
