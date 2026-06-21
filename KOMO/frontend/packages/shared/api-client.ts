// KOMO API Client — HTTP 通信层
// Token 通过 httpOnly Cookie 自动携带，前端不再手动管理。
// CSRF 通过 Double Submit Cookie (XSRF-TOKEN → X-XSRF-TOKEN) 防护。

const API_BASE = 'http://localhost:8081/api';

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
}

// ===== Token 管理（httpOnly Cookie — 前端无需手动操作） =====

/** 从 Cookie 读取 CSRF token（非 httpOnly，Spring Security 自动写入） */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** 调用 /api/auth/me 获取当前登录用户 */
export async function getMe(): Promise<UserInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json: ApiResponse<UserInfo> = await res.json();
    return json.code === 0 ? json.data : null;
  } catch {
    return null;
  }
}

/** 登出 — 清除服务端 httpOnly Cookie */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
  } catch {
    // 静默失败 — 即使服务不可用也要清除本地状态
  }
}

// ===== 兼容旧 API（逐步迁移） =====

/** @deprecated 使用 getMe() 代替 */
export function getToken(): string | null {
  return null; // httpOnly Cookie 不可从 JS 读取
}

/** @deprecated 使用 getMe() 代替 */
export function getUser(): UserInfo | null {
  return null; // 用户状态改为从服务端获取
}

/** @deprecated 不再需要手动存储 token */
export function setTokens(_access: string, _refresh: string, _user: UserInfo) {
  // no-op: tokens 由 httpOnly Cookie 自动管理
}

/** @deprecated 使用 logout() 代替 */
export function clearTokens() {
  // 异步调用 logout 清除 cookie
  logout().catch(() => {});
}

/** @deprecated 不再需要手动刷新 — Cookie 自动携带 refresh token */
export async function refreshAuth(): Promise<boolean> {
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

// ===== 基础请求（含自动刷新） =====

/** 清除登录态并跳转到首页 */
function redirectToLogin() {
  logout().catch(() => {});
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // CSRF Double Submit Cookie
  const csrf = getCsrfToken();
  if (csrf) {
    headers['X-XSRF-TOKEN'] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, '无法连接服务器，请检查后端是否启动');
  }

  // 401/403 → 尝试刷新 token 后重试一次
  if (res.status === 401 || res.status === 403) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      try {
        const newCsrf = getCsrfToken();
        if (newCsrf) headers['X-XSRF-TOKEN'] = newCsrf;
        res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers,
          credentials: 'include',
        });
      } catch {
        throw new ApiError(0, '无法连接服务器，请检查后端是否启动');
      }
    } else {
      redirectToLogin();
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
      redirectToLogin();
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
  user: {
    id: string;
    email: string;
    nickname: string;
  };
}

export async function login(req: LoginRequest): Promise<AuthData> {
  // 使用原生 fetch（不经过 request()，避免循环依赖）
  const csrf = getCsrfToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-XSRF-TOKEN'] = csrf;

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    credentials: 'include',
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
  return json.data;
}

export async function register(req: RegisterRequest): Promise<AuthData> {
  const csrf = getCsrfToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-XSRF-TOKEN'] = csrf;

  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req),
    credentials: 'include',
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
  return get(`/knowledge${qs ? `?${qs}` : ''}`);
}

export async function getKnowledge(id: string): Promise<KnowledgeItem> {
  return get(`/knowledge/${id}`);
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
  return put(`/knowledge/${id}`, req);
}

export async function deleteKnowledge(id: string): Promise<void> {
  return del(`/knowledge/${id}`);
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
  targetTitle?: string;
}

export async function getLinks(entryId: string): Promise<KnowledgeLinkData[]> {
  return get(`/knowledge/${entryId}/links`);
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

// ===== Conversations =====

export interface ConversationData {
  id: string;
  title: string;
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

export async function listConversations(): Promise<ConversationData[]> {
  return get('/conversations');
}

export async function createConversation(title?: string): Promise<ConversationData> {
  return post('/conversations', { title });
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
  knowledgeBaseId?: string
): Promise<unknown> {
  const body: Record<string, string> = { title, content };
  if (knowledgeBaseId) body.knowledgeBaseId = knowledgeBaseId;
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
  return get('/knowledge-bases');
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
  return get(`/categories?kb=${kbId}`);
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
