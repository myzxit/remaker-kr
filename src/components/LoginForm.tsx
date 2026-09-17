"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "signup">(
    params.get("mode") === "signup" ? "signup" : "login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "가입에 실패했습니다.");
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");

      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold">
        {mode === "signup" ? "무료로 시작하기" : "다시 오셨네요"}
      </h1>
      <p className="muted mt-3 text-sm">
        {mode === "signup"
          ? "결제 정보는 받지 않습니다. 모든 도구가 무료입니다."
          : "계정에 로그인하고 작업실로 이동합니다."}
      </p>

      {googleEnabled && (
        <>
          <button
            onClick={() => signIn("google", { callbackUrl: next })}
            className="btn-ghost mt-8 w-full"
          >
            구글 계정으로 계속하기
          </button>
          <div className="muted my-6 flex items-center gap-3 text-xs">
            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
            또는
            <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className={googleEnabled ? "" : "mt-8"}>
        {mode === "signup" && (
          <div className="mb-4">
            <label className="label" htmlFor="name">
              이름 (선택)
            </label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="채널명이나 닉네임"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="label" htmlFor="email">
            이메일
          </label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
          />
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
        )}

        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? "처리 중…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm muted">
        {mode === "signup" ? "이미 계정이 있으신가요? " : "아직 계정이 없으신가요? "}
        <button
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError(null);
          }}
          className="font-semibold  hover:underline"
        >
          {mode === "signup" ? "로그인" : "무료로 가입하기"}
        </button>
      </p>

      <p className="mt-8 text-center text-xs leading-relaxed">
        가입하면 <Link href="/legal/terms" className="underline">이용약관</Link>과{" "}
        <Link href="/legal/privacy" className="underline">개인정보처리방침</Link>에 동의하는 것으로
        봅니다.
      </p>
    </div>
  );
}
