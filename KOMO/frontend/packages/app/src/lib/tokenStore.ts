/**
 * Token 存储 — expo-secure-store 加密存储（Android Keystore / iOS Keychain）。
 * accessToken 内存缓存 + 磁盘持久化；App 冷启动时恢复。
 */
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'komo.accessToken';
const REFRESH_KEY = 'komo.refreshToken';

let cachedAccess: string | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (cachedAccess !== null) return cachedAccess;
  cachedAccess = await SecureStore.getItemAsync(ACCESS_KEY);
  return cachedAccess;
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function saveTokens(accessToken: string, refreshToken: string): Promise<void> {
  cachedAccess = accessToken;
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  cachedAccess = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
