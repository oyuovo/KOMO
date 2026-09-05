/**
 * 服务器地址配置。
 *
 * 默认值来自构建期注入的 EXPO_PUBLIC_API_URL；未设置时回落到本机地址。
 * EXPO_PUBLIC_* 变量在构建时被内联进 bundle，正式包出厂后改不了 ——
 * 因此运行时另有一条逃生通道：地址持久化在 AsyncStorage，
 * 用户可在 设置页 或 登录页 修改（热点/组网切换后电脑 IP 会变，见 P16）。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'komo.serverUrl';

/**
 * 兜底地址：与后端同机调试（Expo web / iOS 模拟器）时可用。
 *
 * 真机连局域网后端时 localhost 指向手机自己，需要改成电脑的局域网 IP ——
 * 在 packages/app/.env 里设 EXPO_PUBLIC_API_URL=http://<电脑IP>:8081/api（该文件不入库），
 * 或直接在 App 登录页/设置页里手填。
 */
const FALLBACK_SERVER_URL = 'http://localhost:8081/api';

/** 首次启动、且用户尚未手改过时使用的服务器地址 */
export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL?.trim() || FALLBACK_SERVER_URL;

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
