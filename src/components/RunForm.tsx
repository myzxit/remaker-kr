"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fetchVoices, type SavedVoice } from "@/components/VoiceManager";
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

  // 숏폼 옵션
  const [shortsCount, setShortsCount] = useState(0);
  const [minSec, setMinSec] = useState(20);
  const [maxSec, setMaxSec] = useState(60);
  const [removeSilence, setRemoveSilence] = useState(true);

  // 무음 제거 옵션
  const [thresholdSec, setThresholdSec] = useState(0.6);
  const [padSec, setPadSec] = useState(0.12);

  // 댓글 이미지 옵션
  const [nickname, setNickname] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [likes, setLikes] = useState(1200);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [myVoices, setMyVoices] = useState<SavedVoice[]>([]);

  const voices = useMemo(() => voicesFor(language), [language]);
  const isRemake = tool === "remake";
  const isDub = tool === "dub";
  const isShorts = tool === "shorts";
  const isSilence = tool === "silence";
  const isComment = tool === "comment";
  /** 댓글 이미지만 원본 영상이 필요 없다. */
  const needsSource = !isComment;

  // 내가 파일에서 떠낸 목소리도 고를 수 있게 불러 온다.
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchVoices().then(setMyVoices);
  }, [status]);

  function pickLanguage(next: string) {
    setLanguage(next);
    if (voice.startsWith("custom:")) return; // 내 목소리는 언어를 바꿔도 그대로 둔다.
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
    if (needsSource) {
      if (mode === "link" && !url.trim()) return setError("영상 주소를 입력해 주세요.");
      if (mode === "upload" && !file) return setError("영상 파일을 선택해 주세요.");
    }
    if (isComment) {
      if (!nickname.trim()) return setError("닉네임을 입력해 주세요.");
      if (!commentBody.trim()) return setError("댓글 내용을 입력해 주세요.");
    }
    if (isShorts && maxSec <= minSec) return setError("최대 길이는 최소 길이보다 길어야 합니다.");

    setBusy(true);
    try {
      let path: string | undefined;
      if (needsSource && mode === "upload" && file) path = await upload(file);

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
          : isShorts
            ? { count: shortsCount, minSec, maxSec, aspect, subtitleStyle, removeSilence }
            : isSilence
              ? { thresholdSec, padSec, burnSubtitles, subtitleStyle }
              : isComment
                ? { nickname: nickname.trim(), body: commentBody.trim(), likes, theme }
                : {};

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: tool,
          sourceType: needsSource ? mode : undefined,
          url: needsSource && mode === "link" ? url.trim() : undefined,
          path,
          title: isComment ? `${nickname.trim()} 댓글` : file?.name,
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
      {needsSource && (
        <>
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
        </>
      )}

      {isComment && (
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="nick">닉네임</label>
            <input
              id="nick"
              className="input"
              placeholder="예: 편집하는곰"
              maxLength={40}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="cbody">댓글 내용</label>
            <textarea
              id="cbody"
              className="input min-h-28"
              placeholder="영상에 얹을 댓글 문구를 적어 주세요."
              maxLength={300}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
            />
            <p className="muted mt-1 text-xs">{commentBody.length}/300자</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="likes">좋아요 수</label>
              <input
                id="likes"
                type="number"
                className="input"
                min={0}
                max={999999}
                value={likes}
                onChange={(e) => setLikes(Math.max(0, Math.min(999999, Number(e.target.value) || 0)))}
              />
            </div>
            <div>
              <label className="label" htmlFor="theme">색</label>
              <select
                id="theme"
                className="select"
                value={theme}
                onChange={(e) => setTheme(e.target.value as "dark" | "light")}
              >
                <option value="dark">어두운 카드</option>
                <option value="light">밝은 카드</option>
              </select>
            </div>
          </div>
          <p className="muted text-xs">
            1080px 너비 PNG 카드로 만들어집니다. 편집 프로그램에서 영상 위에 얹어 쓰세요.
          </p>
        </div>
      )}

      {isShorts && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="count">만들 개수</label>
            <select
              id="count"
              className="select"
              value={shortsCount}
              onChange={(e) => setShortsCount(Number(e.target.value))}
            >
              <option value={0}>자동 (영상 길이에 맞춰)</option>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n}개</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="saspect">화면 비율</label>
            <select id="saspect" className="select" value={aspect} onChange={(e) => setAspect(e.target.value)}>
              {ASPECTS.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="minsec">최소 길이 {minSec}초</label>
            <input
              id="minsec"
              type="range"
              min={10}
              max={90}
              step={5}
              value={minSec}
              onChange={(e) => setMinSec(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--color-brand)" }}
            />
          </div>
          <div>
            <label className="label" htmlFor="maxsec">최대 길이 {maxSec}초</label>
            <input
              id="maxsec"
              type="range"
              min={15}
              max={180}
              step={5}
              value={maxSec}
              onChange={(e) => setMaxSec(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--color-brand)" }}
            />
          </div>
          <div>
            <label className="label" htmlFor="sstyle">자막 스타일</label>
            <select id="sstyle" className="select" value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)}>
              {SUBTITLE_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-center text-sm">
            <input
              type="checkbox"
              checked={removeSilence}
              onChange={(e) => setRemoveSilence(e.target.checked)}
            />
            빈 구간도 함께 걷어내기
          </label>
        </div>
      )}

      {isSilence && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="thr">
              이만큼 쉬면 자르기 — {thresholdSec.toFixed(1)}초
            </label>
            <input
              id="thr"
              type="range"
              min={0.2}
              max={3}
              step={0.1}
              value={thresholdSec}
              onChange={(e) => setThresholdSec(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--color-brand)" }}
            />
            <p className="muted mt-1 text-xs">짧게 잡을수록 많이 잘리고, 말이 툭툭 끊길 수 있습니다.</p>
          </div>
          <div>
            <label className="label" htmlFor="pad">
              말 앞뒤 여유 — {padSec.toFixed(2)}초
            </label>
            <input
              id="pad"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={padSec}
              onChange={(e) => setPadSec(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--color-brand)" }}
            />
            <p className="muted mt-1 text-xs">첫 음절이 잘리면 조금 늘려 보세요.</p>
          </div>
          <div>
            <label className="label" htmlFor="silstyle">자막 스타일</label>
            <select id="silstyle" className="select" value={subtitleStyle} onChange={(e) => setSubtitleStyle(e.target.value)}>
              {SUBTITLE_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 self-center text-sm">
            <input
              type="checkbox"
              checked={burnSubtitles}
              onChange={(e) => setBurnSubtitles(e.target.checked)}
            />
            자막도 넣기
          </label>
        </div>
      )}

      {tool === "policy" && (
        <p className="muted mt-5 text-sm leading-relaxed">
          말을 받아 적어 표현을 훑고, 길이·말의 밀도·음량 같은 형식도 함께 봅니다.
          <b> 판정이 아니라 참고용</b>입니다 — 여기서 걸리지 않았다고 안전하다는 뜻은 아닙니다.
        </p>
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
                  <optgroup label="기본 목소리">
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} · {v.gender === "female" ? "여성" : "남성"}
                      </option>
                    ))}
                  </optgroup>
                  {myVoices.length > 0 && (
                    <optgroup label="내 목소리 (파일에서 떠냄)">
                      {myVoices.map((v) => (
                        <option key={v.id} value={`custom:${v.id}`}>
                          {v.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="muted mt-1 text-xs">
                  {voice.startsWith("custom:")
                    ? "떠낸 목소리는 만드는 데 시간이 더 걸리고, 말 속도 조절은 적용되지 않습니다."
                    : (
                      <>
                        파일 속 목소리를 쓰고 싶다면{" "}
                        <Link href="/voices" className="underline underline-offset-2">
                          내 목소리
                        </Link>
                        에서 추가하세요.
                      </>
                    )}
                </p>
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
        {busy
          ? "시작하는 중…"
          : isRemake
            ? "재구성 시작"
            : isShorts
              ? "숏폼 만들기"
              : isSilence
                ? "빈 구간 걷어내기"
                : isComment
                  ? "댓글 이미지 만들기"
                  : tool === "policy"
                    ? "점검하기"
                    : "시작하기"}
      </button>

      <p className="muted mt-3 text-center text-xs">
        전부 무료입니다.
        {needsSource ? " 본인이 권리를 가진 영상에만 사용하세요." : " 실제 사람의 댓글을 그대로 옮기지 마세요."}
      </p>
    </form>
  );
}
