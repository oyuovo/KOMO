import type { TokenStore } from './api-client';

export interface TokenFile {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  save(): Promise<void>;
}

/** 同步缓存供请求头读取；初始化与写入通过 Promise 明确交付完成状态。 */
export class PersistentTokenStore implements TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;
  private file!: TokenFile;
  private writes: Promise<void> = Promise.resolve();
  readonly ready: Promise<void>;

  constructor(load: () => Promise<TokenFile>) {
    this.ready = this.hydrate(load);
  }

  private async hydrate(load: () => Promise<TokenFile>): Promise<void> {
    try {
      this.file = await load();
      const [access, refresh] = await Promise.all([
        this.file.get<string>('accessToken'), this.file.get<string>('refreshToken'),
      ]);
      this.access = typeof access === 'string' && access ? access : null;
      this.refresh = typeof refresh === 'string' && refresh ? refresh : null;
    } catch (error) {
      console.error('[komo] token store 初始化失败', error);
      throw new Error('无法读取本地登录凭证，请重试；若持续失败，请检查应用数据目录权限');
    }
  }

  getAccessToken(): string | null { return this.access; }
  getRefreshToken(): string | null { return this.refresh; }

  saveTokens(access: string, refresh: string): Promise<void> {
    return this.enqueue(async () => {
      await this.file.set('accessToken', access);
      await this.file.set('refreshToken', refresh);
      await this.file.save();
      this.access = access;
      this.refresh = refresh;
    });
  }

  clearTokens(): Promise<void> {
    return this.enqueue(async () => {
      await this.file.delete('accessToken');
      await this.file.delete('refreshToken');
      await this.file.save();
      this.access = null;
      this.refresh = null;
    });
  }

  private enqueue(write: () => Promise<void>): Promise<void> {
    const operation = this.writes.then(async () => {
      await this.ready;
      try { await write(); }
      catch (error) {
        console.error('[komo] token store 写入失败', error);
        throw new Error('无法保存本地登录状态，请检查应用数据目录权限后重试');
      }
    });
    // 队列继续处理后续操作；当前调用者仍会收到本次错误。
    this.writes = operation.catch(() => undefined);
    return operation;
  }
}
