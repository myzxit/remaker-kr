import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Providers from "@/components/Providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "리메이커 — 영상을 통째로 다시 만듭니다",
    template: "%s | 리메이커",
  },
  description:
    "원본의 목소리·효과음·자막을 걷어내고 새로 입힙니다. 1분에서 25분까지 길이를 지정하면 거기에 맞춰 대본과 화면을 재구성합니다. 전부 무료입니다.",
  openGraph: {
    title: "리메이커 — 영상을 통째로 다시 만듭니다",
    description: "새 목소리, 새 효과음, 새 자막. 크레딧 없이 무료로.",
    locale: "ko_KR",
    type: "website",
  },
};

/** 화면이 그려지기 전에 저장된 테마를 적용한다. 안 하면 깜빡인다. */
const themeScript = `
try {
  var t = localStorage.getItem("remaker-theme");
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main>{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
