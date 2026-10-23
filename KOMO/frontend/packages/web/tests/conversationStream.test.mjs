import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeConversationMessages } from '../src/lib/conversationMessages.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const message = (id, role, content, conversationId = 'a') => ({ id, role, content,
  conversationId, tokensUsed: null, createdAt: '2026-10-22T00:00:00Z' });
const old = [message('u1', 'USER', 'question'), message('a1', 'ASSISTANT', 'old answer')];
const stream = { conversationId: 'a', userContent: 'question', aiContent: 'new answer',
  previousMessageIds: ['u1', 'a1'], phase: 'streaming', error: null, startedAt: 1 };

test('an old assistant at the end of a late fetch cannot hide the current answer', () => {
  const result = mergeConversationMessages(old, stream, 'a');
  assert.equal(result.length, 4);
  assert.equal(result.at(-1).content, 'new answer');
});

test('a newly persisted user message is not duplicated, even with repeated questions', () => {
  const result = mergeConversationMessages([...old, message('u2', 'USER', 'question')], stream, 'a');
  assert.equal(result.length, 4);
  assert.equal(result.at(-1).content, 'new answer');
});

test('only the acknowledged assistant ID replaces the streamed answer and its evidence', () => {
  const completed = { ...stream, phase: 'done', assistantMessageId: 'a2', readingContext: 'evidence' };
  assert.equal(mergeConversationMessages(old, completed, 'a').at(-1).readingContext, 'evidence');
  const saved = [...old, message('u2', 'USER', 'question'), message('a2', 'ASSISTANT', 'new answer')];
  assert.deepEqual(mergeConversationMessages(saved, completed, 'a'), saved);
});

test('switching documents never displays another conversation messages or stream', () => {
  assert.deepEqual(mergeConversationMessages(old, stream, 'b'), []);
});

test('failed partial answers remain visible without claiming persistence', () => {
  assert.equal(mergeConversationMessages(old, { ...stream, phase: 'error' }, 'a').at(-1).content, 'new answer');
  assert.deepEqual(mergeConversationMessages(old, { ...stream, phase: 'error', aiContent: '' }, 'a'), old);
});

const compiled = new Map(['sse', 'conversationStream', 'conversationMessages', 'useConversationStream'].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));

function modules(api, react) {
  const cache = new Map();
  const context = vm.createContext({ TextDecoder, console });
  function load(name) {
    if (name === 'react') return react;
    if (name === '@komo/shared/api-client') return api;
    name = name.replace(/^\.\//, '');
    if (cache.has(name)) return cache.get(name).exports;
    const module = { exports: {} };
    cache.set(name, module);
    vm.runInContext(`(function(require, module, exports) { ${compiled.get(name)}\n})`, context)(load, module, module.exports);
    return module.exports;
  }
  return load;
}

test('real SSE store retains evidence, completion ID and the before-send message IDs', async () => {
  const load = modules({ authenticatedFetch: async () => new Response(
    'event: reading_context\ndata: {"sources":[]}\n\nevent: token\ndata: answer\n\nevent: done\ndata: {"messageId":"a2"}\n\n') });
  const store = load('conversationStream').conversationStreamStore;
  await store.start('a', 'question', ['u1', 'a1']);
  const result = store.getSnapshot().a;
  assert.equal(result.phase, 'done');
  assert.equal(result.assistantMessageId, 'a2');
  assert.equal(result.aiContent, 'answer');
  assert.equal(result.readingContext, '{"sources":[]}');
  assert.deepEqual(Array.from(result.previousMessageIds), ['u1', 'a1']);
});

for (const terminal of ['', 'event: done\ndata: {}\n\n', 'event: error\ndata: incomplete\n\n']) {
  test(`missing/invalid completion cannot mark partial text as saved: ${terminal}`, async () => {
    const load = modules({ authenticatedFetch: async () => new Response('event: token\ndata: partial\n\n' + terminal) });
    const store = load('conversationStream').conversationStreamStore;
    await store.start('a', 'question');
    assert.equal(store.getSnapshot().a.phase, 'error');
    assert.equal(store.getSnapshot().a.aiContent, 'partial');
  });
}

test('late cleanup from a finished turn cannot clear a subsequent active turn', async () => {
  let reply;
  const load = modules({ authenticatedFetch: async () => reply });
  const store = load('conversationStream').conversationStreamStore;
  reply = new Response('event: token\ndata: answer\n\nevent: done\ndata: {"messageId":"a2"}\n\n');
  await store.start('a', 'first');
  const previous = store.getSnapshot().a;
  let finish;
  reply = new Promise(resolve => { finish = resolve; });
  const next = store.start('a', 'second');
  store.clear('a', previous);
  assert.equal(store.getSnapshot().a.userContent, 'second');
  assert.equal(store.isActive('a'), true);
  finish(new Response('event: error\ndata: stopped\n\n'));
  await next;
});

test('done completes the turn even when the HTTP connection stays open', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('event: token\ndata: answer\n\nevent: done\ndata: {"messageId":"a2"}\n\n'));
    },
    cancel() { cancelled = true; },
  });
  const store = modules({ authenticatedFetch: async () => new Response(body) })('conversationStream').conversationStreamStore;
  await store.start('a', 'question');
  assert.equal(cancelled, true);
  assert.equal(store.getSnapshot().a.phase, 'done');
});

// Minimal deterministic hook scheduler: deferred HTTP responses exercise the real
// hook's lifecycle guards without mounting a browser or making network requests.
function hookHarness(getMessages, authenticatedFetch) {
  const slots = [];
  let cursor = 0, dirty = false, pending = [], value, id;
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(factory, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: factory() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
    useSyncExternalStore(subscribe, snapshot) {
      react.useEffect(() => subscribe(() => { dirty = true; }), [subscribe]);
      return snapshot();
    },
  };
  const load = modules({ getMessages, authenticatedFetch }, react);
  const hook = load('useConversationStream').useConversationStream;
  function render(nextId = id) {
    id = nextId;
    do {
      dirty = false; cursor = 0; value = hook(id);
      const effects = pending; pending = []; effects.forEach(fn => fn());
    } while (dirty);
    return value;
  }
  return { render, store: load('conversationStream').conversationStreamStore,
    async flush() { await tick(); return render(); } };
}

test('late fetch from a previous conversation cannot replace current messages', async () => {
  const pending = new Map();
  const harness = hookHarness(id => new Promise(resolve => pending.set(id, resolve)));
  harness.render('a');
  harness.render('b');
  pending.get('b')([message('b1', 'USER', 'B', 'b')]);
  assert.equal((await harness.flush()).displayMessages[0].id, 'b1');
  pending.get('a')(old);
  assert.equal((await harness.flush()).displayMessages[0].id, 'b1');
});

test('switching through null clears messages and ignores the previous failed request', async () => {
  let reject;
  const harness = hookHarness(() => new Promise((_, no) => { reject = no; }));
  harness.render('a');
  harness.render(null);
  reject(new Error('previous conversation failure'));
  const result = await harness.flush();
  assert.equal(result.error, null);
  assert.equal(result.displayMessages.length, 0);
});

test('failed history authorization cannot expose a cached stream or permit sending', async () => {
  const harness = hookHarness(async () => { throw new Error('forbidden'); },
    async () => new Response('event: token\ndata: private answer\n\nevent: done\ndata: {"messageId":"a2"}\n\n'));
  await harness.store.start('a', 'private question');
  assert.equal(harness.render('a').displayMessages.length, 0);
  const result = await harness.flush();
  assert.equal(result.displayMessages.length, 0);
  assert.equal(result.canSend, false);
  assert.match(result.error, /forbidden/);
});

test('failed completion sync preserves the answer and blocks replacement until reload succeeds', async () => {
  const pending = [];
  let calls = 0;
  const harness = hookHarness(() => ++calls === 1 ? Promise.resolve(old)
    : new Promise((resolve, reject) => pending.push({ resolve, reject })),
    async () => new Response('event: token\ndata: new answer\n\nevent: done\ndata: {"messageId":"a2"}\n\n'));
  harness.render('a');
  await harness.flush();
  await harness.store.start('a', 'question', ['u1', 'a1']);
  await harness.flush();
  pending[0].reject(new Error('offline'));
  let result = await harness.flush();
  assert.equal(result.canSend, false);
  assert.equal(result.displayMessages.at(-1).content, 'new answer');
  result.setInput('next question');
  await harness.render().handleSend();
  assert.equal(harness.store.getSnapshot().a.userContent, 'question');
  const reload = result.reload();
  pending[1].resolve([...old, message('u2', 'USER', 'question'), message('a2', 'ASSISTANT', 'new answer')]);
  await reload;
  result = await harness.flush();
  assert.equal(result.error, null);
  assert.equal(result.canSend, true);
  assert.equal(result.displayMessages.length, 4);
  assert.equal(harness.store.getSnapshot().a, undefined);
});
