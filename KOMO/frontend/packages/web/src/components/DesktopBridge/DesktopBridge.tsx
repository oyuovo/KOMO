'use client';

/**
 * 桌面端桥接组件（Phase 2.3 + Phase 3）。
 *
 * 职责：
 * 1. 在模块加载时（早于任何页面 useEffect 的 getMe 调用）注入基于 tauri-plugin-store
 *    的 Token 存储 —— 见下方 initDesktopAuth() 顶层调用。
 * 2. 监听 Rust 端全局快捷键（Ctrl+Alt+K）emit 的 `komo://quick-note` 事件，
 *    跳转到「新建对话」入口页 /conversations，便于快速记录/提问。
 *
 * 零副作用保证：组件本身渲染 null，不产生任何 DOM；所有 Tauri 交互均在
 * `isTauriRuntime()`（即 `'__TAURI_INTERNALS__' in window`）守卫内，且相关 import
 * 全部为动态 import。纯浏览器（Web cookie 模式）下本组件不执行任何 Tauri 代码、
 * 不加载任何 plugin chunk，对现有 Web 行为零影响。
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isTauriRuntime } from '@komo/shared/api-client';
import { initDesktopAuth } from '@/lib/desktop/tokenStore';

// 模块求值即注入 token 存储：此时尚未进入 React 渲染/副作用阶段，
// 可确保后续页面 useEffect 中的 getMe() 能读到（异步 hydrate 回填的）token 缓存。
// 非 Tauri 环境下 initDesktopAuth() 为安全 no-op。
initDesktopAuth();

export default function DesktopBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const stop = await listen('komo://quick-note', () => {
          // 唤起后跳转到新建对话入口页。
          router.push('/conversations');
        });
        if (cancelled) {
          stop();
        } else {
          unlisten = stop;
        }
      } catch (err) {
        console.error('[komo] 监听 quick-note 事件失败', err);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [router]);

  return null;
}
