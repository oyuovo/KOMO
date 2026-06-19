// KOMO API Client — 前端与 Java 后端的 HTTP 通信层
// Token 持久化存储 + 自动刷新 + 401 拦截

const API_BASE = 'http://localhost:8081/api';
const TOKEN_KEY = 'komo_access_token';
const REFRESH_KEY = 'komo_refresh_token';
const USER_KEY = 'komo_user';

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

// ===== Token 管理（localStorage 持久化） =====

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): UserInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh: string, user: UserInfo) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

/** 用 Refresh Token 换取新的 Access Token */
let refreshPromise: Promise<boolean> | null = null;

export async function refreshAuth(): Promise<boolean> {
  // 避免并发刷新
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refresh = getRefreshToken();
      if (!refresh) return false;

      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const json: ApiResponse<{ accessToken: string; refreshToken: string }> = await res.json();
      if (json.code !== 0) {
        clearTokens();
        return false;
      }

      const user = getUser();
      if (user) {
        setTokens(json.data.accessToken, json.data.refreshToken, user);
      }
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ===== 基础请求（含自动刷新） =====

/** 清除登录态并跳转到首页 */
function redirectToLogin() {
  clearTokens();
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

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, '无法连接服务器，请检查后端是否启动');
  }

  // 401/403 → 尝试刷新 token 后重试一次
  if (res.status === 401 || res.status === 403) {
    const refreshed = await refreshAuth();
    if (refreshed) {
      const newToken = getToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        try {
          res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        } catch {
          throw new ApiError(0, '无法连接服务器，请检查后端是否启动');
        }
      }
    } else {
      // 刷新失败 → 直接跳转登录
      redirectToLogin();
      throw new ApiError(401, '登录已过期，请重新登录');
    }
  }

  // 安全解析 JSON（服务不可用时 body 可能为空）
  let json: ApiResponse<T>;
  try {
    json = await res.json();
  } catch {
    if (res.status === 401 || res.status === 403) {
      // Token 可能过期，尝试静默刷新
      const refreshed = await refreshAuth();
      if (refreshed) {
        // 重试请求
        const newToken = getToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
          try {
            res = await fetch(`${API_BASE}${path}`, { ...options, headers });
            json = await res.json();
            if (json.code === 0) return json.data;
          } catch {}
        }
      }
      redirectToLogin();
      throw new ApiError(401, '登录已过期，请重新登录');
    }
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
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    nickname: string;
  };
}

export async function login(req: LoginRequest): Promise<AuthData> {
  const data = await post<AuthData>('/auth/login', req);
  setTokens(data.accessToken, data.refreshToken, data.user);
  return data;
}

export async function register(req: RegisterRequest): Promise<AuthData> {
  const data = await post<AuthData>('/auth/register', req);
  setTokens(data.accessToken, data.refreshToken, data.user);
  return data;
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
  categoryName: string | null;
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

export async function removeLink(entryId: string, linkId: string): Promise<void> {
  return del(`/knowledge/${entryId}/links/${linkId}`);
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
