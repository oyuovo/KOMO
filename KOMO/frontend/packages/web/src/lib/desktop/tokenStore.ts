import { isTauriRuntime, setTokenStore } from '@komo/shared/api-client';
import { PersistentTokenStore } from '@komo/shared/persistent-token-store';

let desktopStore: PersistentTokenStore | null = null;

/** 只在 Tauri 内注入；调用者必须等待初始化完成后再挂载需要登录的页面。 */
export function initDesktopAuth(): Promise<void> | null {
  if (!isTauriRuntime()) return null;
  if (!desktopStore) {
    const store = new PersistentTokenStore(async () => {
      const { load } = await import('@tauri-apps/plugin-store');
      return load('komo-auth.json', { autoSave: false });
    });
    desktopStore = store;
    setTokenStore(store);
    void store.ready.catch(() => {
      // 允许启动错误页重试加载，不能静默切换成重启即丢失的内存会话。
      if (desktopStore === store) desktopStore = null;
    });
  }
  return desktopStore.ready;
}
