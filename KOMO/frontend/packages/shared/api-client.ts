// KOMO API Client — HTTP 通信层
// Web 使用 httpOnly Cookie；桌面使用持久化的 Bearer 凭证。
// CSRF 通过 Double Submit Cookie (XSRF-TOKEN → X-XSRF-TOKEN) 防护。

// 离线阅读缓存的 IndexedDB 存储层（仅桌面 / bearer 模式经守卫后启用）。
import { readCache, writeCache, deleteCachePrefixes } from './offline-cache';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api';

/** 获取 API 基础 URL（供 SSE 流式端点等需要直接访问的场景使用） */
export function getApiBase(): string {
  return API_BASE;
}

/**
 * 认证模式：'cookie'（Web，httpOnly Cookie + CSRF 双提交）/ 'bearer'（桌面，Authorization 头）。
 * 构建期由 NEXT_PUBLIC_AUTH_MODE 决定，未设置时默认 'cookie'（Web）。
 */
export type AuthMode = 'cookie' | 'bearer';

/** 构建期解析认证模式，默认 cookie（Web）。 */
export const AUTH_MODE: AuthMode =
  process.env.NEXT_PUBLIC_AUTH_MODE === 'bearer' ? 'bearer' : 'cookie';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface UserInfo {
  id: string;
  email: string;
  nickname: string;
  autoExtract: boolean;
  dailyRecommendationEnabled: boolean;
  onboardingCompleted: boolean;
}

// ===== 会话管理 =====

/** 从 Cookie 读取 CSRF token（非 httpOnly，Spring Security 自动写入） */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let meRequest: { version: number; promise: Promise<UserInfo | null> } | null = null;

/** 仅确认未登录时返回 null；网络或服务异常交给界面展示，不能伪装成未登录。 */
export async function getMe(): Promise<UserInfo | null> {
  await waitForAuthReady();
  const version = sessionVersion;
  if (meRequest?.version === version) return meRequest.promise;
  const promise = (async () => {
    try {
      const user = await readResponse<UserInfo>(await authenticatedFetch('/auth/me', {}, false));
      assertSession(version);
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.code === 401) return null;
      throw error;
    }
  })().finally(() => {
    if (meRequest?.promise === promise) meRequest = null;
  });
  meRequest = { version, promise };
  return promise;
}

/** 登出 — 清除服务端认证态（Cookie / 本地 token） */
export async function logout(): Promise<void> {
  await waitForAuthReady();
  const headers = { 'Content-Type': 'application/json', ...authTransport.buildHeaders() };
  sessionVersion++;
  if (AUTH_MODE === 'bearer') await tokenStore.clearTokens();
  try {
    const response = await sendFetch('/auth/logout', {
      method: 'POST',
      headers,
      credentials: authTransport.credentials,
    });
    await readResponse<void>(response);
  } catch (error) {
    // Web 的 httpOnly Cookie 只能由服务端清除，失败时不能显示退出成功。
    if (AUTH_MODE === 'cookie') throw error;
  }
}

// ===== 基础请求（含自动刷新） =====

// ===== Token 存储抽象（bearer 模式使用；cookie 模式无需 token） =====

/** 桌面通过 setTokenStore 注入异步持久化存储；请求头从初始化后的缓存同步读取。 */
export interface TokenStore {
  /** 异步存储完成初始化后，才允许构造认证请求。 */
  readonly ready?: Promise<void>;
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  saveTokens(accessToken: string, refreshToken: string): void | Promise<void>;
  clearTokens(): void | Promise<void>;
}

const ACCESS_TOKEN_KEY = 'komo.accessToken';
const REFRESH_TOKEN_KEY = 'komo.refreshToken';

/**
 * 占位实现：基于 localStorage，不依赖任何 Tauri API。
 * SSR / 无 window 环境下所有操作安全降级为 no-op / null。
 */
export class LocalStorageTokenStore implements TokenStore {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  }
  saveTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    } catch {
      throw new Error('无法保存登录状态，请允许应用使用本地存储后重试');
    }
  }
  clearTokens(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      throw new Error('无法清除登录状态，请允许应用使用本地存储后重试');
    }
  }
}

/** 当前 token 存储，可通过 setTokenStore 注入替换（桌面端 tauri-plugin-store 实现）。 */
let tokenStore: TokenStore = new LocalStorageTokenStore();
let sessionVersion = 0;

export async function waitForAuthReady(): Promise<void> {
  if (AUTH_MODE === 'bearer') await tokenStore.ready;
}

/** 注入自定义 TokenStore（供桌面端在应用启动时替换为 tauri-plugin-store 实现）。 */
export function setTokenStore(store: TokenStore): void {
  sessionVersion++;
  tokenStore = store;
}

/** 获取当前 TokenStore。 */
export function getTokenStore(): TokenStore {
  return tokenStore;
}

/**
 * 运行时守卫：判断是否处于 Tauri 桌面容器。
 * 仅做特性探测，不引入任何 Tauri 静态 import。后续桌面任务据此选择 token 存储实现。
 */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ===== 认证传输层（AuthTransport） =====

/**
 * 认证传输适配器：屏蔽 Cookie 与 Bearer 两种认证差异。
 * request() 与 conversationStream 通过当前 transport 单例获取头与 credentials，
 * 不再硬编码认证细节。
 */
export interface AuthTransport {
  /** 构造认证相关请求头（cookie: X-XSRF-TOKEN；bearer: Authorization + X-Komo-Client）。 */
  buildHeaders(): Record<string, string>;
  /** fetch credentials 策略（cookie: 'include'；bearer: 'omit'）。 */
  credentials: RequestCredentials;
  /** 刷新凭证；成功返回 true。bearer 实现需并发去重共享同一次刷新。 */
  refresh(): Promise<boolean>;
}

/** Web 使用 httpOnly Cookie，并在写请求携带 CSRF 头。 */
class CookieTransport implements AuthTransport {
  credentials: RequestCredentials = 'include';
  private refreshPromise: Promise<boolean> | null = null;

  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const csrf = getCsrfToken();
    if (csrf) headers['X-XSRF-TOKEN'] = csrf;
    return headers;
  }

  refresh(): Promise<boolean> {
    this.refreshPromise ??= (async () => {
      const res = await sendFetch('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (res.status === 400 || res.status === 401) return false;
      await readResponse<AuthData>(res);
      return true;
    })().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }
}

/**
 * Bearer 传输（桌面）— Authorization 头 + X-Komo-Client: desktop，credentials:'omit'。
 * refresh() 移植 app/api.ts 的并发共享刷新 Promise（refreshPromise 去重），
 * 避免并发 401 触发多次刷新导致 refresh token 轮换竞争。
 */
class BearerTransport implements AuthTransport {
  credentials: RequestCredentials = 'omit';

  /** 并发 401 时共享同一次刷新，避免 refresh token 被轮换竞争。 */
  private refreshPromise: Promise<boolean> | null = null;
  private refreshVersion = -1;

  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Komo-Client': 'desktop' };
    const token = tokenStore.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  refresh(): Promise<boolean> {
    if (!this.refreshPromise || this.refreshVersion !== sessionVersion) {
      this.refreshVersion = sessionVersion;
      const promise = this.doRefresh().finally(() => {
        if (this.refreshPromise === promise) this.refreshPromise = null;
      });
      this.refreshPromise = promise;
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    await waitForAuthReady();
    const version = sessionVersion;
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return false;
    const res = await sendFetch('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Komo-Client': 'desktop' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'omit',
    });
    assertSession(version);
    if (res.status === 401) return false;
    const data = await readResponse<AuthData>(res);
    assertSession(version);
    const accessToken = data?.accessToken;
    const newRefreshToken = data?.refreshToken;
    if (!accessToken || !newRefreshToken) throw new ApiError(0, '服务器未返回登录凭证，请稍后重试');
    await tokenStore.saveTokens(accessToken, newRefreshToken);
    assertSession(version);
    return true;
  }
}

/** 当前认证传输单例（构建期由 NEXT_PUBLIC_AUTH_MODE 决定，默认 cookie）。 */
export const authTransport: AuthTransport =
  AUTH_MODE === 'bearer' ? new BearerTransport() : new CookieTransport();

/** 持久化登录/注册响应中的 token（仅 bearer 模式返回；cookie 模式为 null，安全 no-op）。 */
async function persistAuthTokens(data: AuthData): Promise<void> {
  if (AUTH_MODE !== 'bearer') return;
  if (!data?.accessToken || !data?.refreshToken) {
    throw new ApiError(0, '服务器未返回登录凭证，请检查桌面端认证配置');
  }
  await tokenStore.saveTokens(data.accessToken, data.refreshToken);
}

/** 认证接口等待响应头最多 15 秒；AI 与数据请求保持原有等待行为。 */
async function sendFetch(path: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = path.startsWith('/auth/') ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
    });
  } catch {
    throw new ApiError(0, '无法连接服务器，请检查网络后重试');
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

function assertSession(version: number): void {
  if (version !== sessionVersion) throw new ApiError(409, '登录状态已变化，请重试');
}

async function expiredSession(version: number, redirect: boolean): Promise<never> {
  assertSession(version);
  const expiredVersion = ++sessionVersion;
  if (AUTH_MODE === 'bearer') await tokenStore.clearTokens();
  assertSession(expiredVersion);
  if (redirect && typeof window !== 'undefined') window.location.href = '/login';
  throw new ApiError(401, '登录已过期，请重新登录');
}

/** 普通 API 与 SSE 共用认证入口；只有收到未认证响应才重试一次。 */
export async function authenticatedFetch(
  path: string, options: RequestInit = {}, redirectOnExpiry = true,
): Promise<Response> {
  await waitForAuthReady();
  const version = sessionVersion;
  const sentToken = tokenStore.getAccessToken();
  const send = (target = path, init = options) => {
    const headers = new Headers(init.headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    Object.entries(authTransport.buildHeaders()).forEach(([key, value]) => headers.set(key, value));
    return sendFetch(target, { ...init, headers, credentials: authTransport.credentials });
  };
  // Spring Security 对无认证的受保护路由可能返回 403；先确认会话，避免把权限不足当作过期。
  const isUnauthorized = async (response: Response) => {
    if (response.status === 401) return true;
    if (response.status !== 403) return false;
    const me = await send('/auth/me', {});
    if (me.status === 401) return true;
    await readResponse<UserInfo>(me);
    return false;
  };
  let res = await send();
  const unauthorized = await isUnauthorized(res);
  assertSession(version);
  if (!unauthorized) return res;
  // 迟到的旧请求可能在另一个请求完成刷新后才返回 401。
  const alreadyRefreshed = AUTH_MODE === 'bearer' && sentToken !== tokenStore.getAccessToken();
  const refreshed = alreadyRefreshed || await authTransport.refresh();
  assertSession(version);
  if (!refreshed) return expiredSession(version, redirectOnExpiry);
  res = await send();
  const stillUnauthorized = await isUnauthorized(res);
  assertSession(version);
  if (stillUnauthorized) return expiredSession(version, redirectOnExpiry);
  return res;
}

async function readResponse<T>(res: Response): Promise<T> {
  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, '服务响应异常，请稍后重试');
  }
  if (!res.ok || json.code !== 0) {
    throw new ApiError(res.ok ? json.code : res.status, json.message || '服务响应异常，请稍后重试');
  }
  return json.data;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  await waitForAuthReady();
  const version = sessionVersion;
  const data = await readResponse<T>(await authenticatedFetch(path, options));
  assertSession(version);
  return data;
}

export class ApiError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'ApiError';
  }
}

// ===== Auth =====

/** 公开的运行时开关，不依赖登录，也不进入离线缓存或自动续期流程。 */
export async function isRegistrationEnabled(): Promise<boolean> {
  try {
    const config = await readResponse<{ registrationEnabled: boolean }>(await sendFetch('/auth/config', {
      method: 'GET', credentials: 'omit', cache: 'no-store',
    }));
    return config?.registrationEnabled === true;
  } catch (error) {
    console.error('[komo] 无法读取注册开关，保持关闭', error);
    return false;
  }
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  nickname?: string;
}

export interface AuthData {
  user: UserInfo;
  /** 原生客户端（bearer 模式）在 body 返回 token；Web（cookie 模式）后端置 null。 */
  accessToken?: string | null;
  refreshToken?: string | null;
}

/** 登录/注册不能触发自动刷新，否则错误密码可能被当成旧会话过期。 */
async function signIn(path: string, req: LoginRequest | RegisterRequest): Promise<AuthData> {
  await waitForAuthReady();
  const version = ++sessionVersion;
  const res = await sendFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authTransport.buildHeaders() },
    body: JSON.stringify(req),
    credentials: authTransport.credentials,
  });
  const data = await readResponse<AuthData>(res);
  assertSession(version);
  await persistAuthTokens(data);
  assertSession(version);
  return data;
}

export function login(req: LoginRequest): Promise<AuthData> {
  return signIn('/auth/login', req);
}

export function register(req: RegisterRequest): Promise<AuthData> {
  return signIn('/auth/register', req);
}

// ===== Knowledge =====

export interface KnowledgeItem {
  id: string;
  version: number;
  title: string;
  content: string;
  source: string;
  entryType: string;
  status: string;
  knowledgeBaseId: string | null;
  categoryId: string | null;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageData<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface KnowledgeCreateRequest {
  title: string;
  content: string;
  entryType?: string;
  knowledgeBaseId?: string;
  categoryId?: string;
  tags?: string;
}

export async function listKnowledge(params?: {
  category?: string;
  kb?: string;
  q?: string;
  page?: number;
  size?: number;
}): Promise<PageData<KnowledgeItem>> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
  if (params?.kb) searchParams.set('kb', params.kb);
  if (params?.q) searchParams.set('q', params.q);
  if (params?.page !== undefined) searchParams.set('page', String(params.page));
  if (params?.size !== undefined) searchParams.set('size', String(params.size));

  const qs = searchParams.toString();
  // 只读列表：网络优先 → 失败回退离线缓存（仅桌面 / bearer 模式，Web 透明跳过）
  return cachedGet('knowledge-list', qs, () =>
    get(`/knowledge${qs ? `?${qs}` : ''}`)
  );
}

export async function getKnowledge(id: string): Promise<KnowledgeItem> {
  // 只读单条（文章 / 碎片正文）：网络优先 → 失败回退离线缓存
  return cachedGet('knowledge', id, () => get(`/knowledge/${id}`));
}

export interface KnowledgeUpdateRequest {
  version: number;
  title: string;
  content: string;
  entryType?: string;
  knowledgeBaseId?: string;
  categoryId?: string | null;
  tags?: string;
}

export async function createKnowledge(
  req: KnowledgeCreateRequest
): Promise<KnowledgeItem> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => post('/knowledge', req));
}

export async function updateKnowledge(
  id: string,
  req: KnowledgeUpdateRequest
): Promise<KnowledgeItem> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => put(`/knowledge/${id}`, req));
}

/** 分类操作不重传列表中的旧正文、标题或标签。null 表示移入无分类。 */
export async function moveKnowledgeToCategory(id: string, categoryId: string | null): Promise<KnowledgeItem> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => put(`/knowledge/${id}/category`, { categoryId }));
}

export async function deleteKnowledge(id: string): Promise<void> {
  await withCacheInvalidation(KNOWLEDGE_CACHES, () => del(`/knowledge/${id}`));
}

export interface BatchDeleteResult {
  deleted: number;
  failed: number;
  total: number;
}

export async function batchDeleteKnowledge(ids: string[]): Promise<BatchDeleteResult> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => del('/knowledge/batch', { ids }));
}

/** 手动重建 ES 索引（从数据库全量回填） */
export async function reindexKnowledge(): Promise<{ indexed: number; message: string }> {
  return post('/knowledge/reindex', {});
}

// ===== Knowledge Links =====

export interface KnowledgeLinkData {
  id: string;
  sourceEntryId: string;
  targetEntryId: string;
  relation: string;
  createdAt: string;
  /** 两端标题（服务端富化填充，前端据 sourceEntryId 判断出链/入链方向） */
  sourceTitle?: string;
  targetTitle?: string;
}

export async function getLinks(entryId: string): Promise<KnowledgeLinkData[]> {
  // 只读双链关系：网络优先 → 失败回退离线缓存
  return cachedGet('links', entryId, () => get(`/knowledge/${entryId}/links`));
}

export async function addLink(
  entryId: string,
  targetEntryId: string,
  relation: string
): Promise<KnowledgeLinkData> {
  return withCacheInvalidation(['links'], () => post(`/knowledge/${entryId}/links`, { targetEntryId, relation }));
}

/** 将知识条目嵌入到目标文章（软关联） */
export async function embedInto(entryId: string, targetEntryId: string): Promise<KnowledgeLinkData> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => post(`/knowledge/${entryId}/embed/${targetEntryId}`, {}));
}

/** 将碎片内容合并进目标文章（内容级合并） */
export async function mergeInto(entryId: string, targetEntryId: string): Promise<KnowledgeItem> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => post(`/knowledge/${entryId}/merge/${targetEntryId}`, {}));
}

// ===== HTTP methods =====

async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function del<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'DELETE',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ===== 离线阅读缓存（仅桌面 / bearer 模式启用；Web cookie 模式透明跳过） =====

/**
 * 运行时守卫：仅桌面 / bearer 模式启用离线缓存。
 * Web（cookie 模式且非 Tauri 容器）返回 false —— 调用方据此直接执行原网络逻辑，
 * 完全不触碰 IndexedDB（不打开 DB、不读写、不评估存储可用性），把 Web 回归风险降到近零。
 * 复用任务 #4 的 AUTH_MODE（构建期）与 isTauriRuntime（运行期特性探测），不引入任何 Tauri 静态 import。
 */
function offlineCacheEnabled(): boolean {
  return AUTH_MODE === 'bearer' || isTauriRuntime();
}

/**
 * 从当前 access token（JWT）解析 userId，用于缓存 key 的用户数据隔离。
 * 仅做 base64url 解码读取 sub 声明（签名校验由后端负责）。
 * 无法确定用户时返回 null，调用方据此跳过缓存 —— 宁可不缓存也绝不跨用户串数据。
 */
function currentUserId(): string | null {
  try {
    const token = tokenStore.getAccessToken();
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64)) as { sub?: string; userId?: string };
    return claims.sub ?? claims.userId ?? null;
  } catch {
    return null;
  }
}

/** 拼接缓存 key：userId 前缀保证不同用户数据隔离，resource + id 定位具体资源。 */
function cacheKey(userId: string, resource: string, id: string): string {
  return `${userId}:${resource}:${id}`;
}

const KNOWLEDGE_CACHES = ['knowledge', 'knowledge-list', 'links'] as const;
const cacheRevisions = new Map<string, number>();
let cacheWrites: Promise<void> = Promise.resolve();

/** 顺序执行缓存写入和失效，保证已经开始的旧写入不会越过删除事务。 */
function queueCacheWrite(task: () => Promise<void>): Promise<void> {
  cacheWrites = cacheWrites.then(task).catch(() => {
    // 缓存不可用不改变已成功的服务器写入结果。
  });
  return cacheWrites;
}

/** 按资源清除当前账号的全部分页/筛选缓存；其他账号缓存不受影响。 */
async function withCacheInvalidation<T>(resources: readonly string[], mutate: () => Promise<T>): Promise<T> {
  if (!offlineCacheEnabled()) return mutate();
  await waitForAuthReady();
  const version = sessionVersion;
  const userId = currentUserId();
  const result = await mutate();
  if (userId) {
    const prefixes = resources.map(resource => cacheKey(userId, resource, ''));
    for (const prefix of prefixes) cacheRevisions.set(prefix, (cacheRevisions.get(prefix) ?? 0) + 1);
    await queueCacheWrite(() => deleteCachePrefixes(prefixes));
  }
  assertSession(version);
  return result;
}

/**
 * 网络优先的只读缓存包裹：
 * 1. 守卫未启用（Web cookie 模式）→ 直接执行 fetcher，完全不触碰 IndexedDB；
 * 2. 无法确定 userId → 同样直接走网络，避免跨用户串数据；
 * 3. 网络成功 → 顺序写缓存（写失败不阻断返回）；发生后续写入的旧读取不再缓存；
 * 4. 网络失败 → 回退读缓存；命中返回缓存，未命中则抛出原始错误（保持既有错误语义）。
 */
async function cachedGet<T>(
  resource: string,
  id: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (!offlineCacheEnabled()) return fetcher();
  await waitForAuthReady();
  const version = sessionVersion;
  const userId = currentUserId();
  if (!userId) return fetcher();
  const key = cacheKey(userId, resource, id);
  const prefix = cacheKey(userId, resource, '');
  const revision = cacheRevisions.get(prefix) ?? 0;
  const isCurrent = () => revision === (cacheRevisions.get(prefix) ?? 0);
  try {
    const data = await fetcher();
    assertSession(version);
    await queueCacheWrite(async () => {
      if (isCurrent() && version === sessionVersion) await writeCache(key, data);
    });
    assertSession(version);
    return data;
  } catch (err) {
    // 退出或切换账号后，不允许旧请求通过缓存回退重新展示原账号内容。
    assertSession(version);
    // 仅连接失败或服务暂时不可用允许降级；权限、删除、限流及格式错误必须交给界面。
    if (!(err instanceof ApiError) || !(err.code === 0 || err.code >= 500 && err.code < 600)) throw err;
    await cacheWrites;
    if (!isCurrent()) throw err;
    const cached = await readCache<T>(key);
    assertSession(version);
    if (isCurrent() && cached !== undefined) return cached;
    throw err;
  }
}

// ===== Conversations =====

export interface ConversationData {
  id: string;
  title: string;
  knowledgeBaseId: string | null;
  /** 对话类型：CHAT 普通对话 / READING 文章侧边栏阅读问答 */
  type?: 'CHAT' | 'READING' | null;
  /** READING 对话关联的文章 ID */
  articleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageData {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  tokensUsed: number | null;
  /** JSON snapshot returned by the reading core; absent on historical/general chat. */
  readingContext?: string | null;
  createdAt: string;
}

export async function listConversations(kbId?: string): Promise<ConversationData[]> {
  const qs = kbId ? `?kb=${kbId}` : '';
  return get(`/conversations${qs}`);
}

export async function createConversation(
  title?: string,
  knowledgeBaseId?: string | null
): Promise<ConversationData> {
  const body: Record<string, string> = {};
  if (title) body.title = title;
  if (knowledgeBaseId) body.knowledgeBaseId = knowledgeBaseId;
  return post('/conversations', body);
}

/** 获取或创建文章的侧边栏阅读问答会话（每篇文章一个，不产生草稿） */
export async function getOrCreateReadingConversation(
  articleId: string
): Promise<ConversationData> {
  return get(`/conversations/reading/${articleId}`);
}

export async function getMessages(conversationId: string): Promise<MessageData[]> {
  return get(`/conversations/${conversationId}/messages`);
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<MessageData> {
  return post(`/conversations/${conversationId}/messages`, { content });
}

export async function deleteConversation(id: string): Promise<void> {
  await del(`/conversations/${id}`);
}

export async function batchDeleteConversations(ids: string[]): Promise<BatchDeleteResult> {
  return del('/conversations/batch', { ids });
}

// ===== Drafts =====

export interface DraftData {
  id: string;
  conversationId: string;
  messageId: string;
  title: string;
  content: string;
  sourceQuote: string | null;
  confidence: number;
  extractType: 'ARTICLE' | 'FRAGMENT' | 'SUPPLEMENT' | null;
  relationType: 'NEW' | 'SUPPLEMENTS' | 'CONTRADICTS' | 'DUPLICATE' | null;
  relationDetail: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'EDITED' | 'REJECTED';
  createdAt: string;
}

export async function listDrafts(): Promise<DraftData[]> {
  return get('/drafts');
}

export async function confirmDraft(
  id: string,
  knowledgeBaseId?: string,
  parentEntryId?: string
): Promise<unknown> {
  const body: Record<string, string> = {};
  if (knowledgeBaseId) body.knowledgeBaseId = knowledgeBaseId;
  if (parentEntryId) body.parentEntryId = parentEntryId;
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => post(`/drafts/${id}/confirm`, body));
}

export async function editAndConfirmDraft(
  id: string,
  title: string,
  content: string,
  knowledgeBaseId?: string,
  parentEntryId?: string
): Promise<unknown> {
  const body: Record<string, string> = { title, content };
  if (knowledgeBaseId) body.knowledgeBaseId = knowledgeBaseId;
  if (parentEntryId) body.parentEntryId = parentEntryId;
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => post(`/drafts/${id}/edit`, body));
}

export async function rejectDraft(id: string): Promise<void> {
  return post(`/drafts/${id}/reject`, {});
}

export async function batchConfirmDrafts(ids: string[]): Promise<{ confirmed: number }> {
  return withCacheInvalidation(KNOWLEDGE_CACHES, () => post('/drafts/batch-confirm', { ids }));
}

export async function batchRejectDrafts(ids: string[]): Promise<{ rejected: number }> {
  return post('/drafts/batch-reject', { ids });
}

// ===== Knowledge Bases =====

export interface KnowledgeBaseData {
  id: string;
  userId: string;
  name: string;
  type: 'SYSTEM_FRAGMENTS' | 'DEFAULT' | 'USER';
  isDeletable: boolean;
  sortOrder: number;
  createdAt: string;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseData[]> {
  // 只读知识库列表：离线时用于导航回退
  return cachedGet('knowledge-bases', 'all', () => get('/knowledge-bases'));
}

export async function createKnowledgeBase(name: string): Promise<KnowledgeBaseData> {
  return withCacheInvalidation(['knowledge-bases'], () => post('/knowledge-bases', { name }));
}

export async function renameKnowledgeBase(id: string, name: string): Promise<KnowledgeBaseData> {
  return withCacheInvalidation(['knowledge-bases'], () => put(`/knowledge-bases/${id}`, { name }));
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  return withCacheInvalidation(['knowledge-bases', 'categories'], () => del(`/knowledge-bases/${id}`));
}

// ===== Categories =====

export interface CategoryData {
  id: string;
  userId: string;
  knowledgeBaseId: string;
  name: string;
  path: string;
  sortOrder: number;
  createdAt: string;
}

export interface CategoryCreateRequest {
  name: string;
  knowledgeBaseId: string;
  parentId?: string;
}

export async function listCategories(kbId: string): Promise<CategoryData[]> {
  // 只读分类树：离线时用于导航回退
  return cachedGet('categories', kbId, () => get(`/categories?kb=${kbId}`));
}

export async function createCategory(req: CategoryCreateRequest): Promise<CategoryData> {
  return withCacheInvalidation(['categories'], () => post('/categories', req));
}

export async function updateCategory(id: string, name: string): Promise<CategoryData> {
  return withCacheInvalidation(['categories'], () => put(`/categories/${id}`, { name }));
}

export async function deleteCategory(id: string): Promise<void> {
  return withCacheInvalidation(['categories', ...KNOWLEDGE_CACHES], () => del(`/categories/${id}`));
}

// ===== Export =====

export async function exportKnowledge(): Promise<KnowledgeItem[]> {
  return get('/knowledge/export');
}

// ===== Preferences =====

export async function updatePreferences(prefs: {
  autoExtract?: boolean;
  dailyRecommendationEnabled?: boolean;
}): Promise<UserInfo> {
  return put('/auth/preferences', prefs);
}

// ===== Manual Extraction =====

export async function extractConversation(conversationId: string): Promise<void> {
  return post(`/conversations/${conversationId}/extract`, {});
}

/** 切换对话归属的知识库。knowledgeBaseId 传 null 表示无知识库。 */
export async function switchConversationKb(
  conversationId: string,
  knowledgeBaseId: string | null
): Promise<ConversationData> {
  return put(`/conversations/${conversationId}/kb`, {
    knowledgeBaseId,
  });
}

// ===== Onboarding =====

export async function completeOnboarding(): Promise<UserInfo> {
  return put('/auth/onboarding/complete', {});
}

export async function resetOnboarding(): Promise<UserInfo> {
  return put('/auth/onboarding/reset', {});
}

// ===== Daily Recommendations =====

export interface DailyRecommendationData {
  id: string;
  userId: string;
  question: string;
  dimension: 'deepening' | 'cross_domain' | 'gap';
  relatedKnowledgeTitles: string | null; // JSON array [{id, title}]
  missingArea: string | null;
  suggestedKbId: string | null;
  status: 'ACTIVE' | 'DISMISSED' | 'SAVED' | 'CONVERSED';
  createdAt: string;
}

export async function getTodayRecommendation(): Promise<DailyRecommendationData | null> {
  return get('/recommendations/today');
}

export async function generateRecommendation(force = false): Promise<DailyRecommendationData | null> {
  return post(`/recommendations/generate${force ? '?force=true' : ''}`, {});
}

export async function dismissRecommendation(id: string): Promise<void> {
  return put(`/recommendations/${id}/dismiss`, {});
}

export async function converseRecommendation(id: string): Promise<void> {
  return put(`/recommendations/${id}/converse`, {});
}
