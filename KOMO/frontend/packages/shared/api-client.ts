// KOMO API Client — HTTP 通信层
// Token 通过 httpOnly Cookie 自动携带，前端不再手动管理。
// CSRF 通过 Double Submit Cookie (XSRF-TOKEN → X-XSRF-TOKEN) 防护。

// 离线阅读缓存的 IndexedDB 存储层（仅桌面 / bearer 模式经守卫后启用）。
import { readCache, writeCache, deleteCache } from './offline-cache';

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

// ===== Token 管理（httpOnly Cookie — 前端无需手动操作） =====

/** 从 Cookie 读取 CSRF token（非 httpOnly，Spring Security 自动写入） */
export function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 调用 /api/auth/me 获取当前登录用户 */
export async function getMe(): Promise<UserInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Content-Type': 'application/json', ...authTransport.buildHeaders() },
      credentials: authTransport.credentials,
    });
    if (!res.ok) return null;
    const json: ApiResponse<UserInfo> = await res.json();
    return json.code === 0 ? json.data : null;
  } catch {
    return null;
  }
}

/** 登出 — 清除服务端认证态（Cookie / 本地 token） */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authTransport.buildHeaders() },
      credentials: authTransport.credentials,
    });
  } catch {
    // 静默失败 — 即使服务不可用也要清除本地状态
  }
  // bearer 模式清除本地 token；cookie 模式无 token 存储，为安全 no-op
  tokenStore.clearTokens();
}

// ===== 基础请求（含自动刷新） =====

/** 清除登录态并跳转到首页 */
function redirectToLogin() {
  logout().catch(() => {});
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

// ===== Token 存储抽象（bearer 模式使用；cookie 模式无需 token） =====

/**
 * Token 存储接口。桌面端（Tauri）后续任务会提供基于 tauri-plugin-store 的实现，
 * 通过 setTokenStore() 注入替换；此处默认使用 localStorage 占位实现。
 * 注意：getAccessToken/getRefreshToken 为同步方法，因为 buildHeaders() 需同步返回头。
 * 未来实现应在内存中维护同步缓存（参考 app 端 tokenStore 的 cachedAccess 思路）。
 */
export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  saveTokens(accessToken: string, refreshToken: string): void;
  clearTokens(): void;
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
      // 存储不可用（隐私模式等）— 静默失败，会话仅在内存中维持
    }
  }
  clearTokens(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // 静默失败
    }
  }
}

/** 当前 token 存储，可通过 setTokenStore 注入替换（桌面端 tauri-plugin-store 实现）。 */
let tokenStore: TokenStore = new LocalStorageTokenStore();

/** 注入自定义 TokenStore（供桌面端在应用启动时替换为 tauri-plugin-store 实现）。 */
export function setTokenStore(store: TokenStore): void {
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
  /** 刷新失败 / 登录态失效时的登出处理。 */
  onLogout(): void;
}

/**
 * Cookie 传输（Web 默认）— 严格等价重构前行为：
 * credentials:'include'；XSRF 双提交（XSRF-TOKEN → X-XSRF-TOKEN）；
 * refresh 走 POST /auth/refresh（refresh token 由 httpOnly Cookie 自动携带）；
 * onLogout 清除服务端 Cookie 并跳转首页。
 */
class CookieTransport implements AuthTransport {
  credentials: RequestCredentials = 'include';

  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const csrf = getCsrfToken();
    if (csrf) headers['X-XSRF-TOKEN'] = csrf;
    return headers;
  }

  async refresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  onLogout(): void {
    redirectToLogin();
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

  buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Komo-Client': 'desktop' };
    const token = tokenStore.getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  refresh(): Promise<boolean> {
    this.refreshPromise ??= this.doRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Komo-Client': 'desktop' },
        body: JSON.stringify({ refreshToken }),
        credentials: 'omit',
      });
      if (!res.ok) return false;
      const json: ApiResponse<AuthData> = await res.json();
      const accessToken = json.data?.accessToken;
      const newRefreshToken = json.data?.refreshToken;
      if (!accessToken || !newRefreshToken) return false;
      tokenStore.saveTokens(accessToken, newRefreshToken);
      return true;
    } catch {
      return false;
    }
  }

  onLogout(): void {
    tokenStore.clearTokens();
    redirectToLogin();
  }
}

/** 当前认证传输单例（构建期由 NEXT_PUBLIC_AUTH_MODE 决定，默认 cookie）。 */
export const authTransport: AuthTransport =
  AUTH_MODE === 'bearer' ? new BearerTransport() : new CookieTransport();

/** 持久化登录/注册响应中的 token（仅 bearer 模式返回；cookie 模式为 null，安全 no-op）。 */
function persistAuthTokens(data: AuthData): void {
  if (data?.accessToken && data?.refreshToken) {
    tokenStore.saveTokens(data.accessToken, data.refreshToken);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // 认证头与 credentials 由当前 transport 提供（cookie / bearer），不再硬编码。
  // transport 头放在最后展开，确保认证头优先于调用方传入的 options.headers。
  const buildHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
    ...authTransport.buildHeaders(),
  });

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: buildHeaders(),
      credentials: authTransport.credentials,
    });
  } catch {
    throw new ApiError(0, '无法连接服务器，请检查后端是否启动');
  }

  // 401/403 → 尝试刷新凭证后重试一次
  if (res.status === 401 || res.status === 403) {
    const refreshed = await authTransport.refresh();
    if (refreshed) {
      try {
        // 重新构造头以携带刷新后的凭证（新 CSRF / 新 access token）
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: buildHeaders(),
          credentials: authTransport.credentials,
        });
      } catch {
        throw new ApiError(0, '无法连接服务器，请检查后端是否启动');
      }
    } else {
      authTransport.onLogout();
      throw new ApiError(401, '登录已过期，请重新登录');
    }
  }

  // 安全解析 JSON
  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(0, '服务响应异常，请稍后重试');
  }

  if (json.code !== 0) {
    if (json.code === 401) {
      authTransport.onLogout();
    }
    throw new ApiError(json.code, json.message);
  }

  return json.data;
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

export async function login(req: LoginRequest): Promise<AuthData> {
  // 使用原生 fetch（不经过 request()，避免循环依赖）；认证头/credentials 由 transport 提供
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authTransport.buildHeaders(),
  };

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    credentials: authTransport.credentials,
  });

  if (!res.ok) {
    let message = '登录失败';
    try {
      const json = await res.json();
      message = json.message || message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  const json: ApiResponse<AuthData> = await res.json();
  if (json.code !== 0) throw new ApiError(json.code, json.message);
  // bearer 模式：后端在 body 返回 token，持久化供后续请求使用；cookie 模式为 no-op
  persistAuthTokens(json.data);
  return json.data;
}

export async function register(req: RegisterRequest): Promise<AuthData> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authTransport.buildHeaders(),
  };

  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    credentials: authTransport.credentials,
  });

  if (!res.ok) {
    let message = '注册失败';
    try {
      const json = await res.json();
      message = json.message || message;
    } catch {}
    throw new ApiError(res.status, message);
  }

  const json: ApiResponse<AuthData> = await res.json();
  if (json.code !== 0) throw new ApiError(json.code, json.message);
  // bearer 模式：后端在 body 返回 token，持久化供后续请求使用；cookie 模式为 no-op
  persistAuthTokens(json.data);
  return json.data;
}

// ===== Knowledge =====

export interface KnowledgeItem {
  id: string;
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
  title: string;
  content: string;
  entryType?: string;
  categoryId?: string;
  tags?: string;
}

export async function createKnowledge(
  req: KnowledgeCreateRequest
): Promise<KnowledgeItem> {
  return post('/knowledge', req);
}

export async function updateKnowledge(
  id: string,
  req: KnowledgeUpdateRequest
): Promise<KnowledgeItem> {
  const result = await put<KnowledgeItem>(`/knowledge/${id}`, req);
  invalidateCache('knowledge', id); // 写后失效对应离线缓存，降低陈旧概率
  return result;
}

export async function deleteKnowledge(id: string): Promise<void> {
  await del(`/knowledge/${id}`);
  invalidateCache('knowledge', id);
}

export interface BatchDeleteResult {
  deleted: number;
  failed: number;
  total: number;
}

export async function batchDeleteKnowledge(ids: string[]): Promise<BatchDeleteResult> {
  return del('/knowledge/batch', { ids });
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
  return post(`/knowledge/${entryId}/links`, { targetEntryId, relation });
}

/** 将知识条目嵌入到目标文章（软关联） */
export async function embedInto(entryId: string, targetEntryId: string): Promise<KnowledgeLinkData> {
  return post(`/knowledge/${entryId}/embed/${targetEntryId}`, {});
}

/** 将碎片内容合并进目标文章（内容级合并） */
export async function mergeInto(entryId: string, targetEntryId: string): Promise<KnowledgeItem> {
  return post(`/knowledge/${entryId}/merge/${targetEntryId}`, {});
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

/**
 * 网络优先的只读缓存包裹：
 * 1. 守卫未启用（Web cookie 模式）→ 直接执行 fetcher，完全不触碰 IndexedDB；
 * 2. 无法确定 userId → 同样直接走网络，避免跨用户串数据；
 * 3. 网络成功 → 异步写缓存后返回最新数据（写失败不阻断返回）；
 * 4. 网络失败 → 回退读缓存；命中返回缓存，未命中则抛出原始错误（保持既有错误语义）。
 */
async function cachedGet<T>(
  resource: string,
  id: string,
  fetcher: () => Promise<T>
): Promise<T> {
  if (!offlineCacheEnabled()) return fetcher();
  const userId = currentUserId();
  if (!userId) return fetcher();
  const key = cacheKey(userId, resource, id);
  try {
    const data = await fetcher();
    void writeCache(key, data);
    return data;
  } catch (err) {
    const cached = await readCache<T>(key);
    if (cached !== undefined) return cached;
    throw err;
  }
}

/** 写操作后失效指定只读缓存（守卫未启用 / 无 userId 时为 no-op，不影响 Web）。 */
function invalidateCache(resource: string, id: string): void {
  if (!offlineCacheEnabled()) return;
  const userId = currentUserId();
  if (!userId) return;
  void deleteCache(cacheKey(userId, resource, id));
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
  return post(`/drafts/${id}/confirm`, body);
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
  return post(`/drafts/${id}/edit`, body);
}

export async function rejectDraft(id: string): Promise<void> {
  return post(`/drafts/${id}/reject`, {});
}

export async function batchConfirmDrafts(ids: string[]): Promise<{ confirmed: number }> {
  return post('/drafts/batch-confirm', { ids });
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
  return post('/knowledge-bases', { name });
}

export async function renameKnowledgeBase(id: string, name: string): Promise<KnowledgeBaseData> {
  return put(`/knowledge-bases/${id}`, { name });
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  return del(`/knowledge-bases/${id}`);
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
  return post('/categories', req);
}

export async function updateCategory(id: string, name: string): Promise<CategoryData> {
  return put(`/categories/${id}`, { name });
}

export async function deleteCategory(id: string): Promise<void> {
  return del(`/categories/${id}`);
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
