import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 업로드 영상은 라우트 핸들러에서 스트림으로 받아 디스크에 쓴다.
    serverActions: { bodySizeLimit: "2gb" },
  },
  // 렌더링 결과물(mp4/jpg)은 /api/media 로만 나간다. 외부 이미지는 쓰지 않는다.
  images: { unoptimized: true },
};

export default nextConfig;
