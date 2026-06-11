// KOMO API Client — 前端与 Java 后端的 HTTP 通信层

const API_BASE = 'http://localhost:8081/api';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

// Token 管理（简单内存存储，后续迁移到 Zustand）
let accessToken: string | null = null;

export function setToken(token: string) {
  accessToken = token;
}

export function getToken(): string | null {
  return accessToken;
}

export function clearToken() {
  accessToken = null;
}

// 基础请求
async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const json: ApiResponse<T> = await res.json();

  if (json.code !== 0) {
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
  return post('/auth/login', req);
}

export async function register(req: RegisterRequest): Promise<AuthData> {
  return post('/auth/register', req);
}

// ===== Knowledge =====

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source: string;
  entryType: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
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
  categoryId?: string;
}

export async function listKnowledge(params?: {
  category?: string;
  q?: string;
  page?: number;
  size?: number;
}): Promise<PageData<KnowledgeItem>> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);
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

async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
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

// ===== Drafts =====

export interface DraftData {
  id: string;
  conversationId: string;
  messageId: string;
  title: string;
  content: string;
  sourceQuote: string | null;
  confidence: number;
  relationType: 'NEW' | 'SUPPLEMENTS' | 'CONTRADICTS' | 'DUPLICATE' | null;
  relationDetail: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'EDITED' | 'REJECTED';
  createdAt: string;
}

export async function listDrafts(): Promise<DraftData[]> {
  return get('/drafts');
}

export async function confirmDraft(id: string): Promise<unknown> {
  return post(`/drafts/${id}/confirm`, {});
}

export async function editAndConfirmDraft(
  id: string,
  title: string,
  content: string
): Promise<unknown> {
  return post(`/drafts/${id}/edit`, { title, content });
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
