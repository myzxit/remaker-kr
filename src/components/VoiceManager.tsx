"use client";

import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/lib/tools";

export type SavedVoice = {
  id: string;
  name: string;
  sampleSec: number;
  sourceName: string | null;
  language: string;
  engine: string;
  consent: boolean;
  createdAt: string;
};

/** 목록만 필요한 곳(재구성 화면 등)에서도 쓴다. */
export async function fetchVoices(): Promise<SavedVoice[]> {
  const res = await fetch("/api/voices");
  if (!res.ok) return [];
  return (await res.json()).voices ?? [];
}

export default function VoiceManager() {
  const fileInput = useRef<HTMLInputElement>(null);

  const [voices, setVoices] = useState<SavedVoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ko");
  const [consent, setConsent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetchVoices()
      .then(setVoices)
      .finally(() => setLoading(false));
  }, []);

  function put(target: File): Promise<SavedVoice> {
    const query = new URLSearchParams({
      name: name.trim(),
      source: target.name,
      language,
      consent: "1",
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/voices?${query}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status < 300) resolve(data);
          else reject(new Error(data.error || "목소리를 저장하지 못했습니다."));
        } catch {
          reject(new Error("서버 응답을 읽지 못했습니다."));
        }
      };
      xhr.onerror = () => reject(new Error("업로드 중 네트워크 오류가 발생했습니다."));
      xhr.send(target);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);

    if (!file) return setError("목소리가 담긴 파일을 선택해 주세요.");
    if (!name.trim()) return setError("목소리 이름을 지어 주세요.");
    if (!consent) return setError("본인 목소리이거나 사용 허락을 받았는지 확인해 주세요.");

    setBusy(true);
    try {
      const saved = await put(file);
      setVoices(await fetchVoices());
      setDone(`"${saved.name}" 목소리를 저장했습니다. 이제 목소리 목록에서 고를 수 있습니다.`);
      setFile(null);
      setName("");
      setConsent(false);
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setPct(0);
    }
  }

  async function remove(voice: SavedVoice) {
    if (!confirm(`"${voice.name}" 목소리를 지울까요?`)) return;
    const res = await fetch(`/api/voices/${voice.id}`, { method: "DELETE" });
    if (res.ok) setVoices((list) => list.filter((v) => v.id !== voice.id));
    else setError((await res.json()).error || "지우지 못했습니다.");
  }

  return (
    <>
      <form onSubmit={submit} className="card">
        <h2 className="text-lg font-bold">목소리 추가</h2>
        <p className="muted mt-1 text-sm">
          말소리가 담긴 영상이나 음성 파일을 올리면, 그 목소리로 대본을 읽어 줍니다.
          <b> 20초 이상</b> 또렷하게 말하는 구간이 가장 좋습니다(최소 10초). 배경음악이 적고 한 사람만
          말할수록 잘 닮습니다 — 10초 안팎의 짧은 참고 음성은 발음이 뭉개지는 일이 잦습니다.
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            setFile(picked);
            if (picked && !name.trim()) setName(picked.name.replace(/\.[^.]+$/, "").slice(0, 40));
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="muted mt-4 w-full rounded-xl px-4 py-7 text-sm"
          style={{ border: "1px dashed var(--line)" }}
        >
          {file
            ? `${file.name} (${(file.size / 1048576).toFixed(1)}MB)`
            : "파일 선택 (mp3 · wav · m4a · mp4 · mov…)"}
        </button>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="vname">목소리 이름</label>
            <input
              id="vname"
              className="input"
              placeholder="예: 내 목소리"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="vlang">주로 읽을 언어</label>
            <select id="vlang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            이 목소리는 <b>내 목소리이거나, 본인에게 사용 허락을 받았습니다.</b> 다른 사람의 목소리를
            허락 없이 흉내 내는 데 쓰지 않겠습니다.
          </span>
        </label>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        {done && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{done}</p>}

        {busy && (
          <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div
              className="h-full transition-all"
              style={{ width: `${pct || 100}%`, background: "var(--color-brand)" }}
            />
          </div>
        )}

        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full py-4 text-base">
          {busy ? (pct < 100 ? `올리는 중… ${pct}%` : "목소리를 떠내는 중…") : "목소리 저장"}
        </button>
      </form>

      <div className="mt-8">
        <h2 className="text-lg font-bold">내 목소리</h2>
        {loading ? (
          <p className="muted mt-3 text-sm">불러오는 중…</p>
        ) : voices.length === 0 ? (
          <p className="muted mt-3 text-sm">아직 저장한 목소리가 없습니다.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {voices.map((v) => (
              <li key={v.id} className="card flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{v.name}</div>
                  <div className="muted mt-1 truncate text-xs">
                    참고 음성 {v.sampleSec.toFixed(1)}초
                    {v.sourceName ? ` · ${v.sourceName}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <audio controls preload="none" src={`/api/voices/${v.id}/sample`} className="h-9" />
                  <button type="button" onClick={() => remove(v)} className="btn-ghost px-3 py-2 text-sm">
                    지우기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
