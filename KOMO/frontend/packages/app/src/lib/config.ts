/**
 * 服务器地址配置。
 * 热点/组网切换后电脑 IP 会变（P16），地址持久化在 AsyncStorage，
 * 用户可在 设置页 或 登录页 修改，无需重新构建。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'komo.serverUrl';

/** 默认指向开发机的局域网地址，首次启动后以存储值为准（登录页/设置页可改） */
export const DEFAULT_SERVER_URL = 'http://10.65.13.123:8081/api';

export async function getServerUrl(): Promise<string> {
  const stored = await AsyncStorage.getItem(KEY);
  return stored && stored.trim() ? stored.trim() : DEFAULT_SERVER_URL;
}

export async function setServerUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('服务器地址不能为空');
  if (!/^https?:\/\//.test(trimmed)) throw new Error('地址需以 http:// 或 https:// 开头');
  await AsyncStorage.setItem(KEY, trimmed);
}
