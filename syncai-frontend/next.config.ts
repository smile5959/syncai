import type { NextConfig } from "next";

const isTauriBuild = process.env.TAURI === "1";

const nextConfig: NextConfig = {
  // Tauri 빌드 시에만 정적 export (로컬 파일로 로드)
  // Vercel 배포는 기본 Next.js 서버 방식 유지
  ...(isTauriBuild && {
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
