/**
 * 桌面端「开机自启」封装（Phase 3）——基于 tauri-plugin-autostart。
 *
 * 全部为动态 import + `'__TAURI_INTERNALS__' in window` 守卫，
 * 浏览器构建不会加载 plugin chunk，零副作用。
 * 非桌面环境返回 null / false，调用方据此隐藏开关 UI。
 */
import { isTauriRuntime } from '@komo/shared/api-client';

/**
 * 读取当前开机自启状态。
 * @returns true/false 表示已启用/未启用；null 表示非桌面环境或读取失败（应隐藏 UI）。
 */
export async function getAutostartEnabled(): Promise<boolean | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch (err) {
    console.error('[komo] 读取开机自启状态失败', err);
    return null;
  }
}

/**
 * 设置开机自启（写入 Windows 注册表 Run 键）。
 * @returns true 表示操作成功；false 表示非桌面环境或操作失败。
 */
export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { enable, disable } = await import('@tauri-apps/plugin-autostart');
    if (enabled) {
      await enable();
    } else {
      await disable();
    }
    return true;
  } catch (err) {
    console.error('[komo] 设置开机自启失败', err);
    return false;
  }
}
