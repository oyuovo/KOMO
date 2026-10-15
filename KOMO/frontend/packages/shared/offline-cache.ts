// KOMO 离线阅读缓存 — IndexedDB 存储层
//
// 职责边界：本模块只负责「安全地读写 IndexedDB」，不包含任何认证 / 运行时守卫逻辑。
// 是否启用缓存、缓存 key 如何拼接（含 userId 隔离）由 api-client.ts 决定，
// 这样可避免与 api-client 形成循环依赖，也让守卫逻辑集中在调用方审查。
//
// 容错原则（贯穿全模块）：IndexedDB 在隐私模式、被禁用、SSR（无 window）或
// 存储配额耗尽等场景下均可能抛错。此处所有对外方法都吞掉异常并静默降级——
// 读返回 undefined、写 / 删静默 no-op，绝不向上抛错、绝不阻断网络请求主流程。

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'komo-offline';
const DB_VERSION = 1;
const STORE_NAME = 'responses';

/** 缓存库结构：单一 object store，key 为字符串（调用方拼接），value 为任意可结构化克隆的响应数据。 */
interface OfflineDB extends DBSchema {
  responses: {
    key: string;
    value: unknown;
  };
}

/** 懒加载的 DB 连接 Promise，全程复用同一连接；打开失败时其解析值为 null。 */
let dbPromise: Promise<IDBPDatabase<OfflineDB> | null> | null = null;

/**
 * 一旦探测到 IndexedDB 不可用（无 window / 打开失败），永久标记，
 * 后续所有操作直接短路降级，避免每次请求都重复尝试打开并抛错。
 */
let unavailable = false;

/** 获取 DB 连接；不可用时返回 null（永不 reject）。 */
function getDb(): Promise<IDBPDatabase<OfflineDB> | null> {
  if (unavailable) return Promise.resolve(null);
  if (typeof indexedDB === 'undefined') {
    unavailable = true;
    return Promise.resolve(null);
  }
  dbPromise ??= openDB<OfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  }).catch(() => {
    // 打开失败（隐私模式 / 配额 / 被阻断）→ 标记不可用并向下游返回 null
    unavailable = true;
    return null;
  });
  return dbPromise;
}

/**
 * 读取缓存。任何异常（含 DB 不可用）均返回 undefined，由调用方决定回退行为。
 * @param key 完整缓存 key（调用方保证含 userId 前缀做数据隔离）
 */
export async function readCache<T>(key: string): Promise<T | undefined> {
  try {
    const db = await getDb();
    if (!db) return undefined;
    return (await db.get(STORE_NAME, key)) as T | undefined;
  } catch {
    return undefined;
  }
}

/**
 * 写入缓存。任何异常均静默忽略——写缓存失败不应影响已成功返回给调用方的网络数据。
 */
export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.put(STORE_NAME, value as unknown, key);
  } catch {
    // 静默降级：结构化克隆失败 / 配额满 / DB 关闭等
  }
}

/**
 * 删除单条缓存（写操作后失效对应只读缓存，降低离线回退时的陈旧概率）。
 * 任何异常均静默忽略。
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.delete(STORE_NAME, key);
  } catch {
    // 静默降级
  }
}
