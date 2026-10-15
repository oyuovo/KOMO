import type { NextConfig } from "next";

// NEXT_BUILD_TARGET==='desktop' 时切换为 Tauri 桌面端静态导出（output: 'export'）。
// 默认（含生产部署 deploy/frontend-build.sh）保持 output: 'standalone'，行为零变化。
const isDesktop = process.env.NEXT_BUILD_TARGET === 'desktop';

const nextConfig: NextConfig = isDesktop
  ? {
      // 桌面端：纯静态导出到 out/，由 Tauri 内置静态服务器/自定义协议加载。
      output: 'export',
      // 生成 dir/index.html 形式，便于静态服务器命中深链目录。
      trailingSlash: true,
      // 静态导出无 next/image 优化服务，必须关闭。
      images: { unoptimized: true },
    }
  : {
      // 生产部署使用 standalone 产物（见 DEPLOY.md），仅影响 next build 输出，不影响 dev。
      output: 'standalone',
    };

export default nextConfig;
