"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";

const NAV = [
  { href: "/#tools", label: "도구" },
  { href: "/guide", label: "사용법" },
  { href: "/pricing", label: "요금" },
  { href: "/faq", label: "질문" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("remaker-theme") as "light" | "dark" | null;
    setTheme(saved);
  }, []);

  function toggle() {
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("remaker-theme", next);
    setTheme(next);
  }

  return (
    <button onClick={toggle} className="btn-ghost px-3 py-2" aria-label="화면 밝기 바꾸기">
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur"
      style={{
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--canvas) 86%, transparent)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg text-white"
            style={{ background: "var(--color-brand)" }}
          >
            ↻
          </span>
          <span className="text-lg">리메이커</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="muted transition hover:opacity-70">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {status === "loading" ? null : session?.user ? (
            <>
              <Link href="/dashboard" className="btn-ghost px-4 py-2">
                작업실
              </Link>
              <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-ghost px-4 py-2">
                로그아웃
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost px-4 py-2">
                로그인
              </Link>
              <Link href="/login?mode=signup" className="btn-primary px-4 py-2">
                무료로 시작
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
