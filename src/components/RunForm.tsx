"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LANGUAGES, ASPECTS, SUBTITLE_CLEANUP, MIN_TARGET_SEC, MAX_TARGET_SEC, type ToolId } from "@/lib/tools";
import { SUBTITLE_STYLES } from "@/lib/subtitleStyles";
import { voicesFor } from "@/lib/voices";

/** 초 → "3분 20초" */
function label(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

export default function RunForm({ tool, compact = false }: { tool: ToolId; compact?: boolean }) {
  const router = useRouter();
  const { status } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // 재구성 옵션
  const [targetSec, setTargetSec] = useState(180);
  const [language, setLanguage] = useState("ko");
  const [voice, setVoice] = useState("ko-KR-SunHiNeural");
  const [rate, setRate] = useState(0);
  const [aspect, setAspect] = useState("16:9");
  const [cleanup, setCleanup] = useState("cover");
  const [subtitleStyle, setSubtitleStyle] = useState("clean");
  const [burnSubtitles, setBurnSubtitles] = useState(true);
  const [sfx, setSfx] = useState(true);
  const [scriptMode, setScriptMode] = useState<"condense" | "faithful">("condense");
  const [showOptions, setShowOptions] = useState(!compact);

  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const voices = useMemo(() => voicesFor(language), [language]);
  const isRemake = tool === "remake";
  const isDub = tool === "dub";

  function pickLanguage(next: string) {
    setLanguage(next);
    const first = voicesFor(next)[0];
    if (first) setVoice(first.id);
  }

  function upload(target: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/upload?name=${encodeURIComponent(target.name)}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          xhr.status < 300 ? resolve(data.path) : reject(new Error(data.error || "업로드 실패"));
        } catch {
          reject(new Error("업로드 응답을 읽지 못했습니다."));
        }
      };
      xhr.onerror = () => reject(new Error("업로드 중 네트워크 오류가 발생했습니다."));
      xhr.send(target);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (status !== "authenticated") {
      router.push(`/login?mode=signup&next=/tools/${tool}`);
      return;
    }
    if (mode === "link" && !url.trim()) return setError("영상 주소를 입력해 주세요.");
    if (mode === "upload" && !file) return setError("영상 파일을 선택해 주세요.");

    setBusy(true);
    try {
      let path: string | undefined;
      if (mode === "upload" && file) path = await upload(file);

      const options: Record<string, unknown> = isRemake
        ? {
            targetSec,
            language,
            voice,
            rate,
            aspect,
            subtitleCleanup: cleanup,
            subtitleStyle,
            burnSubtitles,
            sfx,
            scriptMode,
          }
        : isDub
          ? { language, voice, rate, burnSubtitles, subtitleStyle }
          : {};

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: tool,
          sourceType: mode,
          url: mode === "link" ? url.trim() : undefined,
          path,
          title: file?.name,
          options,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "작업을 시작하지 못했습니다.");
      router.push(`/projects/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setUploadPct(0);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <div
        className="mb-4 inline-flex rounded-xl p-1"
        style={{ border: "1px solid var(--line)" }}
      >
        {(
          [
            ["link", "링크"],
            ["upload", "파일"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition"
            style={
              mode === value
                ? { background: "var(--color-brand)", color: "#fff" }
                : { color: "var(--ink-soft)" }
            }
          >
            {text}
          </button>
        ))}
      </div>

      {mode === "link" ? (
        <input
          type="url"
          className="input"
          placeholder="유튜브 · 인스타그램 · 틱톡 주소"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      ) : (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="muted w-full rounded-xl px-4 py-7 text-sm"
            style={{ border: "1px dashed var(--line)" }}
          >
            {file
              ? `${file.name} (${(file.size / 1048576).toFixed(0)}MB)`
              : "영상 파일 선택 (mp4 · mov · mkv…)"}
          </button>
        </>
      )}

      {isRemake && (
        <div className="mt-5">
          <label className="label" htmlFor="len">
            결과 길이 — <b style={{ color: "var(--ink)" }}>{label(targetSec)}</b>
          </label>
          <input
            id="len"
            type="range"
            min={MIN_TARGET_SEC}
            max={MAX_TARGET_SEC}
            step={30}
            value={targetSec}
            onChange={(e) => setTargetSec(Number(e.target.value))}
            className="w-full"
            style={{ accentColor: "var(--color-brand)" }}
          />
          <div className="muted mt-1 flex justify-between text-xs">
            <span>1분</span>
            <span>25분</span>
          </div>
        </div>
      )}

      {(isRemake || isDub) && (
        <>
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="muted mt-4 text-sm underline-offset-4 hover:underline"
          >
            {showOptions ? "옵션 접기" : "옵션 열기"}
          </button>

          {showOptions && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="lang">언어</label>
                <select id="lang" className="select" value={language} onChange={(e) => pickLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="voice">목소리</label>
                <select id="voice" className="select" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} · {v.gender === "female" ? "여성" : "남성"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="rate">말 속도 {rate > 0 ? `+${rate}` : rate}%</label>
                <input
                  id="rate"
                  type="range"
                  min={-30}
                  max={30}
                  step={5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: "var(--color-brand)" }}
                />
              </div>

              <div>
                <label className="label" htmlFor="style">자막 스타일</label>
                <select id="style" className="select" value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)}>
                  {SUBTITLE_STYLES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {isRemake && (
                <>
                  <div>
                    <label className="label" htmlFor="aspect">화면 비율</label>
                    <select id="aspect" className="select" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                      {ASPECTS.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor="cleanup">원본 자막 처리</label>
                    <select id="cleanup" className="select" value={cleanup} onChange={(e) => setCleanup(e.target.value)}>
                      {SUBTITLE_CLEANUP.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                    <p className="muted mt-1 text-xs">
                      {SUBTITLE_CLEANUP.find((c) => c.id === cleanup)?.hint}
                    </p>
                  </div>

                  <div>
                    <label className="label" htmlFor="script">대본</label>
                    <select
                      id="script"
                      className="select"
                      value={scriptMode}
                      onChange={(e) => setScriptMode(e.target.value as "condense" | "faithful")}
                    >
                      <option value="condense">핵심만 추려서 (길이에 맞춤)</option>
                      <option value="faithful">원본 순서 그대로</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex flex-col justify-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={burnSubtitles} onChange={(e) => setBurnSubtitles(e.target.checked)} />
                  새 자막 넣기
                </label>
                {isRemake && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={sfx} onChange={(e) => setSfx(e.target.checked)} />
                    장면 전환 효과음
                  </label>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {busy && uploadPct > 0 && uploadPct < 100 && (
        <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
          <div
            className="h-full transition-all"
            style={{ width: `${uploadPct}%`, background: "var(--color-brand)" }}
          />
        </div>
      )}

      <button type="submit" disabled={busy} className="btn-primary mt-5 w-full py-4 text-base">
        {busy ? "시작하는 중…" : isRemake ? "재구성 시작" : "시작하기"}
      </button>

      <p className="muted mt-3 text-center text-xs">
        전부 무료입니다. 본인이 권리를 가진 영상에만 사용하세요.
      </p>
    </form>
  );
}
