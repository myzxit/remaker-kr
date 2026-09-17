import Link from "next/link";

const COLUMNS = [
  {
    title: "도구",
    links: [
      { href: "/tools/remake", label: "영상 재구성" },
      { href: "/tools/dub", label: "다국어 더빙" },
      { href: "/tools/shorts", label: "숏폼 만들기" },
      { href: "/tools/extract", label: "영상 가져오기" },
    ],
  },
  {
    title: "안내",
    links: [
      { href: "/guide", label: "사용법" },
      { href: "/pricing", label: "요금" },
      { href: "/faq", label: "자주 묻는 질문" },
      { href: "/library", label: "보관함" },
    ],
  },
  {
    title: "약관",
    links: [
      { href: "/legal/terms", label: "이용약관" },
      { href: "/legal/privacy", label: "개인정보처리방침" },
      { href: "/legal/copyright", label: "저작권 안내" },
      { href: "/legal/oss", label: "오픈소스 고지" },
    ],
  },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2 font-bold">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg text-white"
              style={{ background: "var(--color-brand)" }}
            >
              ↻
            </span>
            <span className="text-lg">리메이커</span>
          </div>
          <p className="muted mt-4 max-w-xs text-sm leading-relaxed">
            영상의 목소리·효과음·자막을 걷어내고 새로 입힙니다. 크레딧도 결제도 없습니다.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold">{col.title}</h3>
            <ul className="mt-4 space-y-2 text-sm">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="muted transition hover:opacity-70">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="muted px-5 py-6 text-center text-xs sm:px-8"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <p>
          본인이 권리를 가진 영상에만 사용하세요. 남의 영상을 재구성해 올리는 것은 저작권 침해가 될
          수 있습니다.
        </p>
        <p className="mt-1">© {new Date().getFullYear()} remaker-kr contributors · MIT License</p>
      </div>
    </footer>
  );
}
