'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_MODE, getMe, isTauriRuntime } from '@komo/shared/api-client';
import { initDesktopAuth } from '@/lib/desktop/tokenStore';
import styles from './DesktopBridge.module.css';

/** 桌面首屏等待凭证恢复与服务器验证；Web 保持原有页面加载方式。 */
export default function DesktopBridge({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(AUTH_MODE !== 'bearer');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (AUTH_MODE !== 'bearer') return;
    let cancelled = false;
    (async () => {
      try {
        await initDesktopAuth();
        const user = await getMe();
        if (cancelled) return;
        if (!user) router.replace('/login');
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '暂时无法启动，请重试');
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, router]);

  useEffect(() => {
    if (!ready || !isTauriRuntime()) return;
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
  }, [ready, router]);

  if (ready) return children;
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-live="polite" aria-busy={!error}>
        <h1>KOMO</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => { setError(null); setAttempt((value) => value + 1); }}>重新连接</button>
          </>
        ) : <p role="status">正在恢复登录状态并连接服务器…</p>}
      </section>
    </main>
  );
}
