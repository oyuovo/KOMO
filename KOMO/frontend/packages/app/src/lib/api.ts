/**
 * API 客户端 — Bearer 认证 + 401 自动刷新 + SSE 流式。
 * 与后端约定：请求带 X-Komo-Client: mobile 时 auth 响应在 body 返回 token；
 * 带 Authorization 头的请求豁免 CSRF（见 SecurityConfig）。
 */
import EventSource from 'react-native-sse';
import { getServerUrl } from './config';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokenStore';
import type { AuthResult } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 并发 401 时共享同一次刷新，避免 refresh token 被轮换竞争 */
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${await getServerUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Komo-Client': 'mobile' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as Envelope<AuthResult>;
    if (!json.data?.accessToken) return false;
    await saveTokens(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function refreshIfNeeded(): Promise<boolean> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** 通用请求：自动带 Bearer；401 时刷新一次并重试 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${await getServerUrl()}${path}`;

  const doFetch = async (token: string | null): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Komo-Client': 'mobile',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  let token = await getAccessToken();
  let res = await doFetch(token);

  // 认证端点自身 401（凭证错误）不触发刷新
  const isAuthPath = path.startsWith('/auth/login') || path.startsWith('/auth/register');
  if (res.status === 401 && token && !isAuthPath) {
    const refreshed = await refreshIfNeeded();
    if (refreshed) {
      token = await getAccessToken();
      res = await doFetch(token);
    }
  }

  if (res.status === 401 && !isAuthPath) {
    await clearTokens(); // 刷新失败 → 登出，由 AuthGate 引导回登录页
  }

  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // 非 JSON 响应（网关错误等）
  }
  if (!res.ok || !json) {
    throw new ApiError(res.status, json?.message || `请求失败（HTTP ${res.status}）`);
  }
  return json.data;
}

/** SSE 流式对话。事件契约与后端 writeSseEvent 一致：token（增量）/ done / error */
export interface StreamHandlers {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: StreamHandlers
): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    handlers.onError('登录已过期，请重新登录');
    return;
  }

  const url = `${await getServerUrl()}/conversations/${conversationId}/messages/stream`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const es = new EventSource<'token' | 'done' | 'error' | 'open' | 'message'>(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
        timeout: 180000, // 与后端 AsyncContext 3 分钟超时对齐
      }
    );

    es.addEventListener('token', (e) => {
      handlers.onToken((e as unknown as { data?: string }).data ?? '');
    });

    es.addEventListener('done', () => {
      es.close();
      handlers.onDone();
      finish();
    });

    es.addEventListener('error', (e) => {
      es.close();
      const err = e as unknown as { data?: string; message?: string };
      handlers.onError(err?.data || err?.message || '连接中断');
      finish();
    });

    // 兜底：error 事件契约之外的失败（网络层），react-native-sse 会触发同名 error
    es.addEventListener('open', () => {
      /* 连接建立，无需处理 */
    });
  });
}
