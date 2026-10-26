import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// 每个测试加载真实 TS 源码到独立上下文，隔离构建期认证模式和模块内刷新状态。
const require = createRequire(import.meta.url);
const compiled = new Map(['api-client', 'offline-cache', 'persistent-token-store'].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../../shared/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));

const user = { id: 'user-test', email: 'test@example.invalid', nickname: 'Test' };
const tokens = { user, accessToken: 'new-access', refreshToken: 'new-refresh' };
const credentials = { email: user.email, password: 'test-only-password' };
const reply = (status, data = null) => Response.json({ code: status === 200 ? 0 : status, message: 'test response', data }, { status });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('category move sends only the category and never resubmits cached article content', async () => {
  const { api } = harness(async (url, options) => {
    assert.ok(url.endsWith('/knowledge/article-1/category'));
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { categoryId: null });
    return reply(200, { id: 'article-1', version: 4, content: 'latest body', tags: 'keep' });
  });
  const result = await api.moveKnowledgeToCategory('article-1', null);
  assert.equal(result.content, 'latest body');
  assert.equal(result.version, 4);
});

test('article update sends the editor version and surfaces conflicts without retrying the write', async () => {
  let calls = 0;
  const { api } = harness(async (_, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).version, 2);
    return reply(409);
  });
  await assert.rejects(api.updateKnowledge('article-1', { title: 'title', content: 'old body', version: 2 }),
    error => error.code === 409);
  assert.equal(calls, 1);
});

test('registration config is public, uncached and independent of token initialization', async () => {
  const store = memoryStore();
  store.ready = new Promise(() => {});
  const { api } = harness(async (url, options) => {
    assert.ok(url.endsWith('/auth/config'));
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers, undefined);
    return reply(200, { registrationEnabled: true });
  }, { store });
  assert.equal(await api.isRegistrationEnabled(), true);
});

for (const data of [{ registrationEnabled: false }, {}, null, { registrationEnabled: 'true' }]) {
  test(`registration stays hidden unless server explicitly enables it: ${JSON.stringify(data)}`, async () => {
    const { api } = harness(async () => reply(200, data));
    assert.equal(await api.isRegistrationEnabled(), false);
  });
}

for (const status of [401, 403, 404, 500]) {
  test(`registration config failure ${status} stays closed without refresh or redirect`, async () => {
    let calls = 0;
    const { api, window, store } = harness(async () => { calls++; return reply(status); });
    assert.equal(await api.isRegistrationEnabled(), false);
    assert.equal(calls, 1);
    assert.equal(window.location.href, '/');
    assert.equal(store.clears, 0);
  });
}

test('offline registration check stays closed and preserves credentials', async () => {
  const { api, store } = harness(async () => { throw new TypeError('offline'); });
  assert.equal(await api.isRegistrationEnabled(), false);
  assert.equal(store.clears, 0);
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function memoryStore(access = 'old-access', refresh = 'old-refresh') {
  return {
    clears: 0,
    getAccessToken: () => access,
    getRefreshToken: () => refresh,
    saveTokens(a, r) { access = a; refresh = r; },
    clearTokens() { access = refresh = null; this.clears++; },
  };
}
function harness(fetch, { mode = 'bearer', store = memoryStore(), timers = {}, cache } = {}) {
  const window = { location: { href: '/' } };
  const context = vm.createContext({
    fetch, Headers, AbortController, AbortSignal, URLSearchParams, atob,
    setTimeout, clearTimeout, ...timers, console: { error() {} }, window,
    document: { cookie: 'XSRF-TOKEN=test-csrf' },
    process: { env: { NEXT_PUBLIC_AUTH_MODE: mode, NEXT_PUBLIC_API_URL: 'https://api.example.invalid/api' } },
  });
  const modules = new Map();
  function load(name) {
    if (name === 'offline-cache' && cache) return cache;
    if (modules.has(name)) return modules.get(name).exports;
    const module = { exports: {} };
    modules.set(name, module);
    const localRequire = id => id.startsWith('./') ? load(id.slice(2)) : require(id);
    vm.runInContext(`(function(require, module, exports) { ${compiled.get(name)}\n})`, context)(localRequire, module, module.exports);
    return module.exports;
  }
  const api = load('api-client');
  api.setTokenStore(store);
  return { api, store, window, ...load('persistent-token-store') };
}

const accountToken = name => `header.${Buffer.from(JSON.stringify({ sub: name })).toString('base64url')}.signature`;

test('offline storage deletes every matching resource prefix in one transaction', async () => {
  const data = new Map([
    ['a:knowledge-list:page=0', 1], ['a:knowledge-list:page=1&q=x', 2],
    ['a:knowledge:article', 3], ['ab:knowledge-list:page=0', 4], ['b:knowledge-list:page=0', 5],
  ]);
  let transactions = 0, committed = false;
  const exports = {};
  vm.runInNewContext(compiled.get('offline-cache'), { exports, indexedDB: {}, require: name => {
    assert.equal(name, 'idb');
    return { async openDB() { return { transaction(store, mode) {
      assert.equal(store, 'responses'); assert.equal(mode, 'readwrite'); transactions++;
      const keys = [...data.keys()]; let index = 0;
      const cursor = () => index === keys.length ? null : {
        key: keys[index], async delete() { data.delete(keys[index]); },
        async continue() { index++; return cursor(); },
      };
      return { store: { async openCursor() { return cursor(); } },
        get done() { committed = true; return Promise.resolve(); } };
    } }; } };
  } });
  await exports.deleteCachePrefixes(['a:knowledge-list:']);
  assert.equal(transactions, 1); assert.equal(committed, true);
  assert.deepEqual([...data.keys()], ['a:knowledge:article', 'ab:knowledge-list:page=0', 'b:knowledge-list:page=0']);
});

function responseCache() {
  const data = new Map();
  return { data,
    async readCache(key) { return data.get(key); },
    async writeCache(key, value) { data.set(key, value); },
    async deleteCachePrefixes(prefixes) {
      for (const key of data.keys()) if (prefixes.some(prefix => key.startsWith(prefix))) data.delete(key);
    },
  };
}

const knowledgeResources = ['knowledge', 'knowledge-list', 'links'];
for (const [operation, args, resources] of [
  ['createKnowledge', [{ title: 'new', content: 'body' }], knowledgeResources],
  ['updateKnowledge', ['article', { title: 'new', content: 'body', version: 1 }], knowledgeResources],
  ['moveKnowledgeToCategory', ['article', null], knowledgeResources],
  ['deleteKnowledge', ['article'], knowledgeResources],
  ['batchDeleteKnowledge', [['article']], knowledgeResources],
  ['embedInto', ['fragment', 'article'], knowledgeResources],
  ['mergeInto', ['fragment', 'article'], knowledgeResources],
  ['confirmDraft', ['draft'], knowledgeResources],
  ['editAndConfirmDraft', ['draft', 'title', 'body'], knowledgeResources],
  ['batchConfirmDrafts', [['draft']], knowledgeResources],
  ['addLink', ['article', 'target', 'RELATED'], ['links']],
  ['createKnowledgeBase', ['new'], ['knowledge-bases']],
  ['renameKnowledgeBase', ['kb', 'new'], ['knowledge-bases']],
  ['deleteKnowledgeBase', ['kb'], ['knowledge-bases', 'categories']],
  ['createCategory', [{ name: 'new', knowledgeBaseId: 'kb' }], ['categories']],
  ['updateCategory', ['cat', 'new'], ['categories']],
  ['deleteCategory', ['cat'], ['categories', ...knowledgeResources]],
]) {
  test(`${operation} invalidates all affected cached pages only for the writing account`, async () => {
    const cache = responseCache();
    const allResources = [...knowledgeResources, 'knowledge-bases', 'categories'];
    for (const owner of ['account-a', 'account-b']) for (const resource of allResources)
      for (const key of ['page=0', 'page=1&q=search']) cache.data.set(`${owner}:${resource}:${key}`, {});
    const { api } = harness(async () => reply(200, {}), { store: memoryStore(accountToken('account-a')), cache });
    await api[operation](...args);
    for (const resource of allResources) for (const key of ['page=0', 'page=1&q=search']) {
      assert.equal(cache.data.has(`account-a:${resource}:${key}`), !resources.includes(resource));
      assert.equal(cache.data.has(`account-b:${resource}:${key}`), true);
    }
  });
}

test('failed writes preserve usable offline cache and web writes never touch the cache', async () => {
  const cache = responseCache(); cache.data.set('account-a:knowledge-list:', { content: ['keep'] });
  const { api } = harness(async () => reply(409), { store: memoryStore(accountToken('account-a')), cache });
  await assert.rejects(api.deleteKnowledge('article'), error => error.code === 409);
  assert.equal(cache.data.size, 1);
  const web = harness(async () => reply(200), { mode: 'cookie', cache: {
    async deleteCachePrefixes() { assert.fail('Web must not access offline storage'); },
  } });
  await web.api.deleteKnowledge('article');
});

test('mutation clears cached lists before resolving and a late read cannot restore old data', async () => {
  const oldRead = deferred(), deletion = deferred(), cache = responseCache();
  let offline = false, reads = 0, invalidating = false;
  const remove = cache.deleteCachePrefixes;
  cache.deleteCachePrefixes = async prefixes => { invalidating = true; await deletion.promise; await remove(prefixes); };
  cache.data.set('account-a:knowledge-list:page=0', { content: ['stale'] });
  const { api } = harness(async (_, options) => {
    if (options.method === 'DELETE') return reply(200);
    reads++;
    if (offline) throw new TypeError('offline');
    return oldRead.promise;
  }, { store: memoryStore(accountToken('account-a')), cache });
  const pendingRead = api.listKnowledge({ page: 0 }); await tick();
  let finished = false;
  const mutation = api.deleteKnowledge('article').then(() => { finished = true; }); await tick();
  assert.equal(invalidating, true); assert.equal(finished, false);
  oldRead.resolve(reply(200, { content: ['stale'] }));
  deletion.resolve(); await mutation; await pendingRead;
  assert.equal(cache.data.size, 0);
  offline = true;
  await assert.rejects(api.listKnowledge({ page: 0 }), error => error.code === 0);
  assert.equal(reads, 2);
});

test('a cache write already in progress finishes before mutation invalidation', async () => {
  const cache = responseCache(), writing = deferred(); let started = false;
  const save = cache.writeCache;
  cache.writeCache = async (key, value) => { started = true; await writing.promise; await save(key, value); };
  const { api } = harness(async () => reply(200, { content: ['old'] }), {
    store: memoryStore(accountToken('account-a')), cache,
  });
  const read = api.listKnowledge(); await tick(); assert.equal(started, true);
  const mutation = api.deleteKnowledge('article'); await tick();
  writing.resolve(); await read; await mutation;
  assert.equal(cache.data.size, 0);
});

test('storage failures do not report a successful server mutation as failed', async () => {
  const { api } = harness(async () => reply(200, { id: 'saved' }), {
    store: memoryStore(accountToken('account-a')),
    cache: { async deleteCachePrefixes() { throw new Error('storage unavailable'); } },
  });
  assert.equal((await api.createKnowledge({ title: 'title', content: 'body' })).id, 'saved');
});

test('cold start waits for persisted tokens before sending /me', async () => {
  const hydration = deferred();
  const store = memoryStore(null, null);
  store.ready = hydration.promise;
  let calls = 0;
  const { api } = harness(async (_, options) => {
    calls++;
    assert.equal(options.headers.get('Authorization'), 'Bearer disk-access');
    assert.equal(options.headers.get('X-Komo-Client'), 'desktop');
    assert.equal(options.credentials, 'omit');
    return reply(200, user);
  }, { store });
  const pending = api.getMe();
  await tick();
  assert.equal(calls, 0);
  store.saveTokens('disk-access', 'disk-refresh');
  hydration.resolve();
  assert.deepEqual(await pending, user);
  assert.equal(calls, 1);
});

test('expired access token refreshes and concurrent /me checks share the result', async () => {
  let refreshes = 0, requests = 0;
  const { api, store } = harness(async (url, options) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      assert.equal(JSON.parse(options.body).refreshToken, 'old-refresh');
      return reply(200, tokens);
    }
    requests++;
    return options.headers.get('Authorization') === 'Bearer new-access' ? reply(200, user) : reply(401);
  });
  const results = await Promise.all([api.getMe(), api.getMe(), api.getMe()]);
  assert.deepEqual(results, [user, user, user]);
  assert.equal(refreshes, 1);
  assert.equal(requests, 2);
  assert.equal(store.getRefreshToken(), 'new-refresh');
});

test('concurrent API failures share one refresh, including a late old 401', async () => {
  const delayed = deferred(), refresh = deferred();
  let refreshes = 0;
  const { api } = harness(async (url, options) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return refresh.promise; }
    if (options.headers.get('Authorization') === 'Bearer new-access') return reply(200, user);
    if (url.endsWith('/slow')) return delayed.promise;
    return reply(401);
  });
  const first = api.authenticatedFetch('/first');
  const second = api.authenticatedFetch('/second');
  const slow = api.authenticatedFetch('/slow');
  await tick();
  refresh.resolve(reply(200, tokens));
  await Promise.all([first, second]);
  delayed.resolve(reply(401));
  assert.equal((await slow).status, 200);
  assert.equal(refreshes, 1);
});

test('invalid refresh clears stored credentials and /me returns null without redirecting', async () => {
  const { api, store, window } = harness(async () => reply(401));
  assert.equal(await api.getMe(), null);
  assert.equal(store.getAccessToken(), null);
  assert.equal(store.getRefreshToken(), null);
  assert.equal(store.clears, 1);
  assert.equal(window.location.href, '/');
});

for (const failure of ['offline', 'server', 'rate-limit', 'malformed', 'missing-tokens']) {
  test(`refresh ${failure} preserves credentials and exposes a retryable error`, async () => {
    const { api, store, window } = harness(async url => {
      if (!url.endsWith('/auth/refresh')) return reply(401);
      if (failure === 'offline') throw new TypeError('network unavailable');
      if (failure === 'server') return reply(503);
      if (failure === 'rate-limit') return reply(429);
      if (failure === 'malformed') return new Response('<html>gateway</html>');
      return reply(200, { user });
    });
    await assert.rejects(api.getMe(), error => error.code !== 401);
    assert.equal(store.getRefreshToken(), 'old-refresh');
    assert.equal(store.clears, 0);
    assert.equal(window.location.href, '/');
  });
}

test('first /me network failure is not a signed-out session', async () => {
  const { api, store } = harness(async () => { throw new TypeError('offline'); });
  await assert.rejects(api.getMe(), error => error.code === 0);
  assert.equal(store.clears, 0);
});

test('anonymous cold start does not call refresh without a stored refresh token', async () => {
  const paths = [];
  const { api } = harness(async url => { paths.push(url); return reply(401); }, { store: memoryStore(null, null) });
  assert.equal(await api.getMe(), null);
  assert.equal(paths.length, 1);
  assert.ok(paths[0].endsWith('/auth/me'));
});

test('permission 403 with a valid session does not refresh or clear credentials', async () => {
  const { api, store } = harness(async url => url.endsWith('/auth/me') ? reply(200, user) : reply(403));
  assert.equal((await api.authenticatedFetch('/restricted')).status, 403);
  assert.equal(store.clears, 0);
});

test('Spring unauthenticated 403 refreshes before retrying a protected request', async () => {
  let attempts = 0;
  const { api } = harness(async (url, options) => {
    if (url.endsWith('/auth/me')) return reply(401);
    if (url.endsWith('/auth/refresh')) return reply(200, tokens);
    attempts++;
    return options.headers.get('Authorization') === 'Bearer new-access' ? reply(200, []) : reply(403);
  });
  assert.equal((await api.authenticatedFetch('/protected')).status, 200);
  assert.equal(attempts, 2);
});

test('a second 401 stops retrying and clears the session', async () => {
  let refreshes = 0;
  const { api, store, window } = harness(async url => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return reply(200, tokens); }
    return reply(401);
  });
  await assert.rejects(api.authenticatedFetch('/protected'), error => error.code === 401);
  assert.equal(refreshes, 1);
  assert.equal(store.getAccessToken(), null);
  assert.equal(window.location.href, '/login');
});

test('login waits for tokens to reach persistent storage', async () => {
  const saved = deferred();
  const store = memoryStore(null, null);
  store.saveTokens = () => saved.promise;
  const { api } = harness(async () => reply(200, tokens), { store });
  let completed = false;
  const login = api.login(credentials).then(() => { completed = true; });
  await tick();
  assert.equal(completed, false);
  saved.resolve();
  await login;
  assert.equal(completed, true);
});

test('repeated unauthenticated 403 also stops after one refresh', async () => {
  let refreshes = 0;
  const { api, store } = harness(async url => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return reply(200, tokens); }
    return reply(url.endsWith('/auth/me') ? 401 : 403);
  });
  await assert.rejects(api.authenticatedFetch('/protected'), error => error.code === 401);
  assert.equal(refreshes, 1);
  assert.equal(store.getAccessToken(), null);
});

test('late /me body cannot show the previous account after logout', async () => {
  const body = deferred();
  const { api } = harness(async url => url.endsWith('/auth/logout') ? reply(200) : {
    status: 200, ok: true, json: () => body.promise,
  });
  const rejected = assert.rejects(api.getMe(), error => error.code === 409);
  await tick();
  await api.logout();
  body.resolve({ code: 0, data: user });
  await rejected;
});

test('wrong password does not invoke refresh and missing bearer tokens do not count as login success', async () => {
  let calls = 0;
  const { api } = harness(async () => { calls++; return reply(401); });
  await assert.rejects(api.login(credentials), error => error.code === 401);
  assert.equal(calls, 1);
  const missing = harness(async () => reply(200, { user }));
  await assert.rejects(missing.api.login(credentials), /服务器未返回登录凭证/);
});

test('late refresh cannot resurrect a logged-out session', async () => {
  const refresh = deferred();
  const { api, store } = harness(async url => {
    if (url.endsWith('/auth/refresh')) return refresh.promise;
    if (url.endsWith('/auth/logout')) return reply(200);
    return reply(401);
  });
  const pending = api.getMe();
  const rejected = assert.rejects(pending, error => error.code === 409);
  await tick();
  await api.logout();
  refresh.resolve(reply(200, tokens));
  await rejected;
  assert.equal(store.getAccessToken(), null);
  assert.equal(store.getRefreshToken(), null);
});

test('late refresh cannot overwrite a newly logged-in account', async () => {
  const refresh = deferred();
  const { api, store } = harness(async url => {
    if (url.endsWith('/auth/refresh')) return refresh.promise;
    if (url.endsWith('/auth/login')) return reply(200, { user, accessToken: 'account-b', refreshToken: 'refresh-b' });
    return reply(401);
  });
  const rejected = assert.rejects(api.getMe(), error => error.code === 409);
  await tick();
  await api.login(credentials);
  refresh.resolve(reply(200, tokens));
  await rejected;
  assert.equal(store.getAccessToken(), 'account-b');
  assert.equal(store.getRefreshToken(), 'refresh-b');
});

test('old account cache cannot bypass the session-change guard after logout', async () => {
  const response = deferred();
  const jwt = `header.${Buffer.from(JSON.stringify({ sub: 'account-a' })).toString('base64url')}.signature`;
  let cacheReads = 0;
  const { api } = harness(async url => url.endsWith('/auth/logout') ? reply(200) : response.promise, {
    store: memoryStore(jwt, 'refresh-a'),
    cache: {
      async readCache() { cacheReads++; return { id: 'private-article' }; },
      async writeCache() {}, async deleteCache() {},
    },
  });
  const rejected = assert.rejects(api.getKnowledge('private-article'), error => error.code === 409);
  await tick();
  await api.logout();
  response.resolve(reply(503));
  await rejected;
  assert.equal(cacheReads, 0);
});

test('connection timeout rejects without clearing credentials', async () => {
  let expire;
  const { api, store } = harness((_, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), { timers: { setTimeout: callback => { expire = callback; }, clearTimeout() {} } });
  const rejection = assert.rejects(api.getMe(), error => error.code === 0);
  await tick();
  expire();
  await rejection;
  assert.equal(store.clears, 0);
});

test('authenticated SSE uses refreshed headers and keeps the response body readable', async () => {
  let signal;
  const { api } = harness(async (url, options) => {
    if (url.endsWith('/auth/refresh')) return reply(200, tokens);
    if (options.headers.get('Authorization') !== 'Bearer new-access') return reply(401);
    assert.equal(options.method, 'POST');
    assert.equal(options.body, '{"content":"hello"}');
    signal = options.signal;
    return new Response('data: hello\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const response = await api.authenticatedFetch('/messages/stream', { method: 'POST', body: '{"content":"hello"}' });
  assert.equal(await response.text(), 'data: hello\n\n');
  assert.equal(signal.aborted, false);
});

test('authentication timeout does not impose a new deadline on slow AI requests', async () => {
  let timers = 0;
  const { api } = harness(async () => new Response('data: hello\n\n'), {
    timers: { setTimeout() { timers++; return 1; }, clearTimeout() {} },
  });
  await api.authenticatedFetch('/messages/stream', { method: 'POST', body: '{}' });
  assert.equal(timers, 0);
});

test('cookie logout is independent of browser localStorage availability', async () => {
  const store = memoryStore();
  store.clearTokens = () => assert.fail('cookie logout must not access localStorage');
  const { api } = harness(async () => reply(200), { mode: 'cookie', store });
  await api.logout();
});

test('cookie mode still uses credentials and CSRF, refreshes /me without storing bearer tokens', async () => {
  let refreshed = false;
  const store = memoryStore(null, null);
  store.saveTokens = () => assert.fail('cookie mode must not store tokens');
  const { api } = harness(async (url, options) => {
    assert.equal(options.credentials, 'include');
    const headers = new Headers(options.headers);
    assert.equal(headers.has('Authorization'), false);
    if (url.endsWith('/auth/refresh')) { refreshed = true; return reply(200, { user }); }
    assert.equal(headers.get('X-XSRF-TOKEN'), 'test-csrf');
    if (url.endsWith('/auth/login')) return reply(200, { user });
    return refreshed ? reply(200, user) : reply(401);
  }, { mode: 'cookie', store });
  assert.deepEqual(await api.getMe(), user);
  assert.deepEqual((await api.login(credentials)).user, user);
});

function tokenFile(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data, snapshots: [],
    async get(key) { return data.get(key); },
    async set(key, value) { data.set(key, value); },
    async delete(key) { return data.delete(key); },
    async save() { this.snapshots.push(Object.fromEntries(data)); },
  };
}

for (const status of [403, 404, 409, 429]) {
  test(`HTTP ${status} is not hidden by a cached article`, async () => {
    let cacheReads = 0;
    const jwt = `header.${Buffer.from(JSON.stringify({ sub: 'account-a' })).toString('base64url')}.signature`;
    const { api } = harness(async url => url.endsWith('/auth/me') ? reply(200, user) : reply(status), {
      store: memoryStore(jwt, 'refresh-a'),
      cache: { async readCache() { cacheReads++; return { id: 'stale' }; } },
    });
    await assert.rejects(api.getKnowledge('stale'), error => error.code === status);
    assert.equal(cacheReads, 0);
  });
}

test('temporary network failure can still read the current account cache', async () => {
  const jwt = `header.${Buffer.from(JSON.stringify({ sub: 'account-a' })).toString('base64url')}.signature`;
  const { api } = harness(async () => { throw new TypeError('offline'); }, {
    store: memoryStore(jwt, 'refresh-a'),
    cache: { async readCache(key) { assert.ok(key.startsWith('account-a:')); return { id: 'cached' }; } },
  });
  assert.equal((await api.getKnowledge('cached')).id, 'cached');
});

for (const mode of ['cookie', 'bearer']) {
  test(`${mode} registration accepts HTTP 201 and preserves its credential contract`, async () => {
    const { api, store } = harness(async (url, options) => {
      assert.ok(url.endsWith('/auth/register'));
      assert.equal(options.credentials, mode === 'cookie' ? 'include' : 'omit');
      return Response.json({ code: 0, data: mode === 'cookie' ? { user } : tokens }, { status: 201 });
    }, { mode, store: memoryStore(null, null) });
    assert.deepEqual((await api.register(credentials)).user, user);
    assert.equal(store.getAccessToken(), mode === 'cookie' ? null : 'new-access');
  });
}

test('cookie logout reports failure when server cookies cannot be cleared', async () => {
  const { api } = harness(async () => { throw new TypeError('offline'); }, { mode: 'cookie' });
  await assert.rejects(api.logout(), error => error.code === 0);
});

test('bearer logout can still clear local credentials while offline', async () => {
  const { api, store } = harness(async () => { throw new TypeError('offline'); });
  await api.logout();
  assert.equal(store.getAccessToken(), null);
});

test('persistent store serializes save and clear after slow hydration; restart reads the final state', async () => {
  const load = deferred();
  const file = tokenFile({ accessToken: 'disk-old', refreshToken: 'disk-refresh' });
  const { PersistentTokenStore } = harness(async () => reply(200));
  const store = new PersistentTokenStore(() => load.promise);
  const save = store.saveTokens('login-new', 'login-refresh');
  const clear = store.clearTokens();
  load.resolve(file);
  await Promise.all([save, clear]);
  assert.deepEqual(file.snapshots, [{ accessToken: 'login-new', refreshToken: 'login-refresh' }, {}]);
  assert.equal(store.getAccessToken(), null);
  const restarted = new PersistentTokenStore(async () => file);
  await restarted.ready;
  assert.equal(restarted.getRefreshToken(), null);
});

test('successful login remains available after recreating the persistent store', async () => {
  const file = tokenFile();
  const { api, PersistentTokenStore } = harness(async () => reply(200, tokens));
  const store = new PersistentTokenStore(async () => file);
  api.setTokenStore(store);
  await api.login(credentials);
  const restarted = new PersistentTokenStore(async () => file);
  await restarted.ready;
  assert.equal(restarted.getAccessToken(), tokens.accessToken);
  assert.equal(restarted.getRefreshToken(), tokens.refreshToken);
});

test('unreadable storage blocks requests; failed persistence does not report a successful login', async () => {
  const { api, PersistentTokenStore } = harness(async () => reply(200, tokens));
  const broken = new PersistentTokenStore(async () => { throw new Error('read denied'); });
  api.setTokenStore(broken);
  await assert.rejects(api.getMe(), /无法读取本地登录凭证/);
  const file = tokenFile();
  file.save = async () => { throw new Error('disk full'); };
  const store = new PersistentTokenStore(async () => file);
  api.setTokenStore(store);
  await assert.rejects(api.login(credentials), /无法保存本地登录状态/);
  assert.equal(store.getAccessToken(), null);
});
