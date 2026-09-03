/**
 * 认证上下文 — 冷启动从 SecureStore 恢复 token 并用 /auth/me 校验有效性。
 * RootLayout 据此决定显示登录页还是主界面。
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { clearTokens, getAccessToken, saveTokens } from './tokenStore';
import type { AuthResult, User } from './types';

interface AuthState {
  status: 'loading' | 'signedIn' | 'signedOut';
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await api<User>('/auth/me');
        if (!cancelled) {
          setUser(me);
          setStatus('signedIn');
        }
      } catch {
        if (!cancelled) {
          await clearTokens();
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!result.accessToken) throw new Error('登录失败：服务端未返回凭证');
    await saveTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
    setStatus('signedIn');
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string) => {
    const result = await api<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nickname: nickname || undefined }),
    });
    if (!result.accessToken) throw new Error('注册失败：服务端未返回凭证');
    await saveTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' }); // 后端清 cookie，App 端 token 本地清除
    } catch {
      // 后端不可达也要完成本地登出
    }
    await clearTokens();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({ status, user, login, register, logout }),
    [status, user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return ctx;
}
