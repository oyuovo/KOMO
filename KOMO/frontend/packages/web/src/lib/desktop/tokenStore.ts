/**
 * 桌面端 Token 存储（Phase 2.3）——基于 tauri-plugin-store 的 TokenStore 实现。
 *
 * 设计要点：
 * - shared/api-client 的 TokenStore 接口要求 getAccessToken/getRefreshToken 为「同步」方法
 *   （因为 buildHeaders() 需同步返回请求头）。而 plugin-store 的读写是异步 IPC。
 *   因此这里在内存中维护同步缓存，启动时经 hydrate() 异步回填，写操作即时更新缓存 + 异步落盘。
 * - 所有 Tauri 相关 import 均为「动态 import」，且仅在 `'__TAURI_INTERNALS__' in window`
 *   守卫通过后触发；纯浏览器构建产物不会加载本 chunk，零副作用。
 * - 存储文件为 %APPDATA% 下的明文 JSON（komo-auth.json），符合自用威胁模型。
 */
import { setTokenStore, type TokenStore } from '@komo/shared/api-client';

const STORE_FILE = 'komo-auth.json';
const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

/** plugin-store 的 Store 实例最小结构（避免静态类型依赖）。 */
interface PluginStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  save(): Promise<void>;
}

class TauriTokenStore implements TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;
  private store: PluginStore | null = null;
  /** hydrate 完成的 Promise；写操作在此之后再落盘，避免竞态覆盖。 */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = (await load(STORE_FILE, { autoSave: false })) as unknown as PluginStore;
      this.store = store;
      this.access = (await store.get<string>(ACCESS_KEY)) ?? null;
      this.refresh = (await store.get<string>(REFRESH_KEY)) ?? null;
    } catch (err) {
      // 存储不可用时降级为纯内存会话（重启后需重新登录），不抛出以免中断启动。
      console.error('[komo] token store 初始化失败', err);
    }
  }

  getAccessToken(): string | null {
    return this.access;
  }

  getRefreshToken(): string | null {
    return this.refresh;
  }

  saveTokens(accessToken: string, refreshToken: string): void {
    // 同步更新内存缓存，使紧随其后的请求头立即携带新 token。
    this.access = accessToken;
    this.refresh = refreshToken;
    void this.persist();
  }

  clearTokens(): void {
    this.access = null;
    this.refresh = null;
    void this.persistClear();
  }

  private async persist(): Promise<void> {
    try {
      await this.ready;
      if (!this.store) return;
      await this.store.set(ACCESS_KEY, this.access);
      await this.store.set(REFRESH_KEY, this.refresh);
      await this.store.save();
    } catch (err) {
      console.error('[komo] token 持久化失败', err);
    }
  }

  private async persistClear(): Promise<void> {
    try {
      await this.ready;
      if (!this.store) return;
      await this.store.delete(ACCESS_KEY);
      await this.store.delete(REFRESH_KEY);
      await this.store.save();
    } catch (err) {
      console.error('[komo] token 清除失败', err);
    }
  }
}

let desktopStore: TauriTokenStore | null = null;

/**
 * 在应用启动时注入桌面 Token 存储。
 * 仅当处于 Tauri 容器时生效；浏览器 / SSR 环境为安全 no-op。
 * 幂等：重复调用返回同一实例的 ready Promise。
 * @returns hydrate 完成的 Promise；非桌面环境返回 null。
 */
export function initDesktopAuth(): Promise<void> | null {
  if (typeof window === 'undefined') return null;
  if (!('__TAURI_INTERNALS__' in window)) return null;
  if (desktopStore) return desktopStore.ready;
  desktopStore = new TauriTokenStore();
  setTokenStore(desktopStore);
  return desktopStore.ready;
}

/** 获取桌面 token 存储 hydrate 完成的 Promise（未初始化则为 null）。 */
export function getDesktopAuthReady(): Promise<void> | null {
  return desktopStore?.ready ?? null;
}
