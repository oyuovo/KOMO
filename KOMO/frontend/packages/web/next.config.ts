import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 生产部署使用 standalone 产物（见 DEPLOY.md），仅影响 next build 输出，不影响 dev。
  output: 'standalone',
};

export default nextConfig;
