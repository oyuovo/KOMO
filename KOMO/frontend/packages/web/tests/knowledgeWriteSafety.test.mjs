import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const article = { id: 'article-1', title: '原标题', content: '原正文', version: 3,
  entryType: 'FACT', categoryId: null, knowledgeBaseId: 'kb-1', tags: '保留标签', updatedAt: '2026-10-25' };

// Run the real components with deterministic hooks and JSX objects. No DOM or network required.
function componentHarness(path, componentName, api, extras = {}) {
  const slots = [];
  let cursor = 0, dirty = false, pending = [], tree;
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
  const react = {
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; dirty = true; }];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8')
    + `\nexport { ${componentName} as TestComponent };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const mocks = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    '@komo/shared/api-client': api, ...extras };
  const hookExports = {};
  const hookCode = ts.transpileModule(readFileSync(new URL('../src/hooks/useLatestRequest.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(hookCode, { exports: hookExports, require: id => mocks[id] });
  mocks['@/hooks/useLatestRequest'] = hookExports;
  vm.runInNewContext(code, { exports, console, confirm: () => true, require: id => {
    if (id in mocks) return mocks[id];
    if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => key }) };
    if (id.startsWith('@/components/') || id === 'next/link') return { default: id };
    throw new Error(`Unexpected import: ${id}`);
  } });
  function render(props = {}) {
    do {
      dirty = false; cursor = 0;
      tree = exports.TestComponent(props);
      const effects = pending; pending = []; effects.forEach(fn => fn());
    } while (dirty);
    return tree;
  }
  return { render, unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    async flush(props = {}) { await tick(); return render(props); } };
}

function nodes(tree, match) {
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, match));
  if (!tree || typeof tree !== 'object') return [];
  return [...(match(tree) ? [tree] : []), ...nodes(tree.props?.children, match)];
}

const treeCategories = [
  { id: 'root-a', name: '父分类', path: 'root', sortOrder: 0 },
  { id: 'root-a-extra', name: '兄弟分类', path: 'root', sortOrder: 1 },
  { id: 'child', name: '子分类', path: 'root.root_a', sortOrder: 0 },
  { id: 'grandchild', name: '孙分类', path: 'root.root_a.child', sortOrder: 0 },
  { id: 'other-child', name: '另一分支', path: 'root.root_a_extra', sortOrder: 0 },
];
const treeArticles = [
  { ...article, id: 'in-parent', categoryId: 'root-a' },
  { ...article, id: 'in-child', categoryId: 'child' },
  { ...article, id: 'in-grandchild', categoryId: 'grandchild' },
  { ...article, id: 'uncategorized', categoryId: null },
];
const treeProps = { searchQuery: '', knowledgeBaseId: 'kb-1', categoryId: null };
function treeHarness(api = {}) {
  return componentHarness('../src/components/KnowledgeList/KnowledgeList.tsx', 'KnowledgeList', {
    listKnowledge: async () => ({ content: treeArticles, totalElements: treeArticles.length }),
    listCategories: async () => treeCategories, ...api,
  });
}
const categoryNames = tree => nodes(tree, n => n.props?.className === 'categoryName').map(n => n.props.children);
const articleLinks = tree => nodes(tree, n => n.type === 'next/link').map(n => n.props.href);
function toggleCategory(tree, name) {
  const button = nodes(tree, n => n.props?.className === 'categoryToggle'
    && nodes(n, c => c.props?.className === 'categoryName' && c.props.children === name).length)[0];
  assert.ok(button, `Missing category ${name}`);
  button.props.onClick();
}

test('tree renders descendants beneath their own parent and hides the entire collapsed subtree', async () => {
  const harness = treeHarness();
  harness.render(treeProps);
  let tree = await harness.flush(treeProps);
  assert.deepEqual(categoryNames(tree), ['父分类', '兄弟分类']);
  assert.deepEqual(articleLinks(tree), ['/article?id=uncategorized']);
  toggleCategory(tree, '父分类'); tree = harness.render(treeProps);
  assert.deepEqual(categoryNames(tree), ['父分类', '子分类', '兄弟分类']);
  toggleCategory(tree, '子分类'); tree = harness.render(treeProps);
  toggleCategory(tree, '孙分类'); tree = harness.render(treeProps);
  assert.deepEqual(categoryNames(tree), ['父分类', '子分类', '孙分类', '兄弟分类']);
  const rows = nodes(tree, n => ['categoryRow', 'articleRow'].includes(n.props?.className));
  assert.deepEqual(rows.map(n => n.props.style.paddingLeft), [8, 32, 32, 56, 56, 80, 8, 8]);
  toggleCategory(tree, '父分类'); tree = harness.render(treeProps);
  assert.deepEqual(categoryNames(tree), ['父分类', '兄弟分类']);
  assert.deepEqual(articleLinks(tree), ['/article?id=uncategorized']);
  toggleCategory(tree, '父分类'); tree = harness.render(treeProps);
  assert.ok(articleLinks(tree).includes('/article?id=in-grandchild'));
});

test('sidebar selection expands its ancestors using whole path segments', async () => {
  const harness = treeHarness();
  harness.render(treeProps); await harness.flush(treeProps);
  let tree = harness.render({ ...treeProps, categoryId: 'grandchild' });
  assert.ok(articleLinks(tree).includes('/article?id=in-grandchild'));
  assert.equal(articleLinks(tree).includes('/article?id=in-parent'), false);
  // root-a must not be treated as an ancestor of root-a-extra.
  const otherHarness = treeHarness();
  const props = { ...treeProps, categoryId: 'other-child' };
  otherHarness.render(props); tree = await otherHarness.flush(props);
  assert.deepEqual(categoryNames(tree), ['父分类', '兄弟分类', '另一分支']);
});

test('selection excludes category IDs and folding deselects hidden articles before batch deletion', async () => {
  const deleted = [];
  const harness = treeHarness({ deleteKnowledge: async id => { deleted.push(id); } });
  harness.render(treeProps);
  let tree = await harness.flush(treeProps);
  toggleCategory(tree, '父分类'); tree = harness.render(treeProps);
  toggleCategory(tree, '子分类'); tree = harness.render(treeProps);
  nodes(tree, n => n.type === 'button' && n.props.children === '选择')[0].props.onClick();
  tree = harness.render(treeProps);
  const checkboxes = nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox');
  assert.equal(checkboxes.length, 4); // Select-all + 3 visible articles; no category checkboxes.
  checkboxes[0].props.onChange(); tree = harness.render(treeProps);
  toggleCategory(tree, '父分类'); tree = harness.render(treeProps);
  assert.equal(nodes(tree, n => n.props?.className === 'selectedCount')[0].props.children.join(''), '已选 1 项');
  // Expanding again must not silently restore selections on hidden articles.
  toggleCategory(tree, '父分类'); tree = harness.render(treeProps);
  assert.equal(nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.checked, false);
  await nodes(tree, n => n.type === 'button' && n.props.children === '批量删除')[0].props.onClick();
  assert.deepEqual(deleted, ['uncategorized']);
});

test('changing category filter clears selection and batch moves only visible article IDs', async () => {
  const moved = [];
  const harness = treeHarness({ moveKnowledgeToCategory: async id => { moved.push(id); } });
  harness.render(treeProps);
  let tree = await harness.flush(treeProps);
  nodes(tree, n => n.type === 'button' && n.props.children === '选择')[0].props.onClick();
  tree = harness.render(treeProps);
  nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange();
  tree = harness.render(treeProps);
  const props = { ...treeProps, categoryId: 'child' };
  tree = harness.render(props);
  assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === '批量删除')[0].props.disabled, true);
  nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox')[0].props.onChange();
  tree = harness.render(props);
  nodes(tree, n => n.type === 'button' && n.props.children === '移动到分类')[0].props.onClick();
  tree = harness.render(props);
  await nodes(tree, n => n.type === '@/components/CategoryPickerModal/CategoryPickerModal')[0].props.onConfirm(null);
  assert.deepEqual(moved, ['in-child']);
});

test('editor sends its loaded version and keeps unsaved text visible after a conflict', async () => {
  let sent;
  const navigation = [];
  const harness = componentHarness('../src/app/article/edit/page.tsx', 'EditKnowledgeContent', {
    getMe: async () => ({ id: 'user-1' }), getKnowledge: async () => article,
    listKnowledgeBases: async () => [{ id: 'kb-1', name: '知识库' }], listCategories: async () => [],
    updateKnowledge: async (_, req) => { sent = req; throw new Error('文章已被修改'); },
  }, { 'next/navigation': { useRouter: () => ({ push: url => navigation.push(url) }),
    useSearchParams: () => new URLSearchParams('id=article-1') } });
  harness.render();
  let tree = await harness.flush();
  nodes(tree, n => n.type === 'textarea')[0].props.onChange({ target: { value: '尚未保存的修改' } });
  tree = harness.render();
  await nodes(tree, n => n.type === 'button' && n.props.children === '保存修改')[0].props.onClick();
  tree = await harness.flush();
  assert.equal(sent.version, 3);
  assert.equal(sent.content, '尚未保存的修改');
  assert.equal(nodes(tree, n => n.type === 'textarea')[0].props.value, '尚未保存的修改');
  assert.equal(nodes(tree, n => n.props?.role === 'alert').length, 1);
  assert.equal(navigation.length, 0);
});

test('category move from an old list sends no title, body or tags', async () => {
  const moves = [];
  const props = { searchQuery: '', knowledgeBaseId: 'kb-1', categoryId: null };
  const harness = componentHarness('../src/components/KnowledgeList/KnowledgeList.tsx', 'KnowledgeList', {
    listKnowledge: async () => ({ content: [article], totalElements: 1 }), listCategories: async () => [],
    moveKnowledgeToCategory: async (...args) => { moves.push(args); },
  });
  harness.render(props);
  let tree = await harness.flush(props);
  nodes(tree, n => n.type === 'button' && n.props.children === '选择')[0].props.onClick();
  tree = harness.render(props);
  const boxes = nodes(tree, n => n.type === 'input' && n.props.type === 'checkbox');
  boxes[1].props.onChange();
  tree = harness.render(props);
  nodes(tree, n => n.type === 'button' && n.props.children === '移动到分类')[0].props.onClick();
  tree = harness.render(props);
  await nodes(tree, n => n.type === '@/components/CategoryPickerModal/CategoryPickerModal')[0].props.onConfirm('category-2');
  assert.deepEqual(moves, [['article-1', 'category-2']]);
});

for (const targetCategory of [null, 'category-2']) {
  test(`editor submits destination with ${targetCategory ?? 'no category'} in the content save`, async () => {
    const sent = [], navigation = [];
    const harness = componentHarness('../src/app/article/edit/page.tsx', 'EditKnowledgeContent', {
      getMe: async () => ({ id: 'user-1' }),
      getKnowledge: async () => ({ ...article, categoryId: 'old-category' }),
      listKnowledgeBases: async () => [{ id: 'kb-1', name: '原库' }, { id: 'kb-2', name: '目标库' }],
      listCategories: async kb => [{ id: kb === 'kb-1' ? 'old-category' : 'category-2', name: '分类', path: 'root' }],
      updateKnowledge: async (...args) => { sent.push(args); },
    }, { 'next/navigation': { useRouter: () => ({ push: url => navigation.push(url) }),
      useSearchParams: () => new URLSearchParams('id=article-1') } });
    harness.render(); await harness.flush();
    let tree = await harness.flush();
    nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'kb-2' } });
    tree = harness.render();
    assert.equal(nodes(tree, n => n.type === 'select')[1].props.value, '');
    assert.equal(nodes(tree, n => n.type === 'option' && n.props.value === 'old-category').length, 0);
    tree = await harness.flush();
    if (targetCategory) {
      nodes(tree, n => n.type === 'select')[1].props.onChange({ target: { value: targetCategory } });
      tree = harness.render();
    }
    await nodes(tree, n => n.type === 'button' && n.props.children === '保存修改')[0].props.onClick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], article.id);
    assert.equal(sent[0][1].knowledgeBaseId, 'kb-2');
    assert.equal(sent[0][1].categoryId, targetCategory);
    assert.equal(sent[0][1].version, article.version);
    assert.equal(sent[0][1].content, article.content);
    assert.deepEqual(navigation, ['/article?id=article-1']);
  });
}

test('late category responses cannot replace the newly selected base options', async () => {
  let resolveOld;
  const pendingOld = new Promise(resolve => { resolveOld = resolve; });
  const harness = componentHarness('../src/app/article/edit/page.tsx', 'EditKnowledgeContent', {
    getMe: async () => ({ id: 'user-1' }), getKnowledge: async () => article,
    listKnowledgeBases: async () => [{ id: 'kb-1' }, { id: 'kb-2' }],
    listCategories: kb => kb === 'kb-1' ? pendingOld : Promise.resolve([{ id: 'new-category', name: '新分类', path: 'root' }]),
  }, { 'next/navigation': { useRouter: () => ({ push() {} }),
    useSearchParams: () => new URLSearchParams('id=article-1') } });
  harness.render();
  let tree = await harness.flush();
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'kb-2' } });
  harness.render(); await harness.flush();
  resolveOld([{ id: 'old-category', name: '旧分类', path: 'root' }]);
  tree = await harness.flush();
  assert.equal(nodes(tree, n => n.type === 'option' && n.props.value === 'new-category').length, 1);
  assert.equal(nodes(tree, n => n.type === 'option' && n.props.value === 'old-category').length, 0);
  assert.equal(nodes(tree, n => n.type === 'select')[1].props.disabled, false);
});

test('failed migration preserves chosen destination and unsaved content', async () => {
  const navigation = [];
  const harness = componentHarness('../src/app/article/edit/page.tsx', 'EditKnowledgeContent', {
    getMe: async () => ({ id: 'user-1' }), getKnowledge: async () => article,
    listKnowledgeBases: async () => [{ id: 'kb-1' }, { id: 'kb-2' }], listCategories: async () => [],
    updateKnowledge: async () => { throw new Error('知识库不存在或已删除'); },
  }, { 'next/navigation': { useRouter: () => ({ push: url => navigation.push(url) }),
    useSearchParams: () => new URLSearchParams('id=article-1') } });
  harness.render();
  let tree = await harness.flush();
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'kb-2' } });
  nodes(tree, n => n.type === 'textarea')[0].props.onChange({ target: { value: '保留修改' } });
  tree = harness.render();
  await nodes(tree, n => n.type === 'button' && n.props.children === '保存修改')[0].props.onClick();
  tree = await harness.flush();
  assert.equal(nodes(tree, n => n.type === 'select')[0].props.value, 'kb-2');
  assert.equal(nodes(tree, n => n.type === 'textarea')[0].props.value, '保留修改');
  assert.equal(nodes(tree, n => n.props?.role === 'alert').length, 1);
  assert.deepEqual(navigation, []);
});

test('refused nonempty base deletion displays the reason and preserves selection', async () => {
  const selected = [];
  const props = { selectedId: 'kb-1', selectedCategoryId: null,
    onSelect: value => selected.push(value), onCategorySelect: () => {} };
  const harness = componentHarness('../src/components/KnowledgeBaseSidebar/KnowledgeBaseSidebar.tsx', 'KnowledgeBaseSidebar', {
    listKnowledgeBases: async () => [{ id: 'kb-1', name: '我的库', type: 'USER', isDeletable: true }],
    listCategories: async () => [],
    deleteKnowledgeBase: async () => { throw new Error('知识库中仍有文章、会话，请先处理后再删除'); },
  });
  harness.render(props);
  let tree = await harness.flush(props);
  nodes(tree, n => n.props?.title === '删除')[0].props.onClick({ stopPropagation() {} });
  tree = await harness.flush(props);
  assert.equal(nodes(tree, n => n.props?.role === 'alert')[0].props.children,
    '知识库中仍有文章、会话，请先处理后再删除');
  assert.equal(nodes(tree, n => n.props?.children === '我的库').length, 1);
  assert.deepEqual(selected, []);
});

test('an article with a missing historical category remains visible in its base', async () => {
  const props = { searchQuery: '', knowledgeBaseId: 'kb-1', categoryId: null };
  const harness = componentHarness('../src/components/KnowledgeList/KnowledgeList.tsx', 'KnowledgeList', {
    listKnowledge: async () => ({ content: [{ ...article, categoryId: 'deleted-category' }], totalElements: 1 }),
    listCategories: async () => [{ id: 'existing-category', path: 'root', name: '其他分类' }],
  });
  harness.render(props);
  const tree = await harness.flush(props);
  assert.equal(nodes(tree, n => n.type === 'next/link' && n.props.href === '/article?id=article-1').length, 1);
});

for (const change of ['knowledgeBaseId', 'searchQuery']) {
  for (const fails of [false, true]) {
    test(`old list ${fails ? 'failure' : 'success'} cannot overwrite latest ${change}`, async () => {
      const old = deferred(), latest = deferred(), stats = [];
      let count = 0;
      const harness = treeHarness({ listKnowledge: () => (++count === 1 ? old.promise : latest.promise), listCategories: async () => [] });
      const before = { ...treeProps, onStatsChange: value => stats.push(value) };
      const after = { ...before, [change]: 'new-scope' };
      harness.render(before); harness.render(after);
      // A stale completion must not stop the loading indicator of the current request.
      if (fails) old.reject(new Error('旧请求失败'));
      else old.resolve({ content: [{ ...article, id: 'old-article' }], totalElements: 99 });
      let tree = await harness.flush(after);
      assert.equal(nodes(tree, n => n.props?.children === '加载中...').length, 1);
      assert.deepEqual(articleLinks(tree), []);
      assert.equal(stats.length, 0);
      latest.resolve({ content: [{ ...article, id: 'new-article' }], totalElements: 1 });
      tree = await harness.flush(after);
      assert.deepEqual(articleLinks(tree), ['/article?id=new-article']);
      assert.equal(nodes(tree, n => n.props?.children === '旧请求失败').length, 0);
      assert.equal(stats.length, 1); assert.equal(stats[0].count, 1);
    });
  }
}

test('scope change immediately hides old articles and an old mutation cannot reload the old scope', async () => {
  const newLoad = deferred(), removed = deferred(), requests = [];
  const harness = treeHarness({
    listCategories: async () => [],
    listKnowledge: params => {
      requests.push(params.kb);
      return params.kb === 'kb-1' ? Promise.resolve({ content: [article], totalElements: 1 }) : newLoad.promise;
    }, deleteKnowledge: () => removed.promise,
  });
  harness.render(treeProps); let tree = await harness.flush(treeProps);
  const deletion = nodes(tree, n => n.props?.title === '删除文章')[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  const next = { ...treeProps, knowledgeBaseId: 'kb-2' };
  tree = harness.render(next);
  assert.deepEqual(articleLinks(tree), []);
  removed.resolve(); await deletion;
  newLoad.resolve({ content: [{ ...article, id: 'new' }], totalElements: 1 });
  tree = await harness.flush(next);
  assert.deepEqual(requests, ['kb-1', 'kb-2']);
  assert.deepEqual(articleLinks(tree), ['/article?id=new']);
});

test('unmounted list does not publish late statistics', async () => {
  const load = deferred(), stats = [];
  const harness = treeHarness({ listKnowledge: () => load.promise });
  harness.render({ ...treeProps, onStatsChange: value => stats.push(value) }); harness.unmount();
  load.resolve({ content: [article], totalElements: 1 }); await tick();
  assert.equal(stats.length, 0);
});

test('sidebar keeps latest categories when a previous base finishes late', async () => {
  const old = deferred();
  const harness = componentHarness('../src/components/KnowledgeBaseSidebar/KnowledgeBaseSidebar.tsx', 'KnowledgeBaseSidebar', {
    listKnowledgeBases: async () => [{ id: 'kb-1', name: '原库' }, { id: 'kb-2', name: '新库' }],
    listCategories: kb => kb === 'kb-1' ? old.promise : Promise.resolve([{ id: 'new-cat', name: '新分类', path: 'root' }]),
  });
  const props = { selectedId: 'kb-1', selectedCategoryId: null, onSelect() {}, onCategorySelect() {} };
  harness.render(props); await harness.flush(props);
  const next = { ...props, selectedId: 'kb-2' }; harness.render(next); await harness.flush(next);
  old.resolve([{ id: 'old-cat', name: '旧分类', path: 'root' }]);
  const tree = await harness.flush(next);
  assert.equal(nodes(tree, n => n.props?.children === '新分类').length, 1);
  assert.equal(nodes(tree, n => n.props?.children === '旧分类').length, 0);
});

for (const [path, componentName] of [
  ['../src/app/knowledge/create/page.tsx', 'CreateKnowledgePage'],
  ['../src/app/categories/page.tsx', 'CategoriesPage'],
]) {
  test(`${componentName} rejects late categories from previous knowledge base`, async () => {
    const old = deferred();
    const harness = componentHarness(path, componentName, {
      getMe: async () => ({ id: 'user' }),
      listKnowledgeBases: async () => [{ id: 'kb-1', name: '原库' }, { id: 'kb-2', name: '新库' }],
      listCategories: kb => kb === 'kb-1' ? old.promise : Promise.resolve([{ id: 'new-cat', name: '新分类', path: 'root' }]),
    }, { 'next/navigation': { useRouter: () => ({ push() {} }) } });
    harness.render(); let tree = await harness.flush();
    nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'kb-2' } });
    harness.render(); await harness.flush();
    old.resolve([{ id: 'old-cat', name: '旧分类', path: 'root' }]);
    tree = await harness.flush();
    assert.equal(nodes(tree, n => n.props?.children === '旧分类').length, 0);
    assert.ok(JSON.stringify(tree).includes('新分类'));
  });
}

test('finishing a category mutation after switching bases does not reload its previous base', async () => {
  const deletion = deferred(), calls = [];
  const harness = componentHarness('../src/app/categories/page.tsx', 'CategoriesPage', {
    getMe: async () => ({ id: 'user' }), listKnowledgeBases: async () => [{ id: 'kb-1' }, { id: 'kb-2' }],
    listCategories: async kb => { calls.push(kb); return [{ id: kb + '-cat', name: kb, path: 'root' }]; },
    deleteCategory: () => deletion.promise,
  });
  harness.render(); await harness.flush(); let tree = await harness.flush();
  const pending = nodes(tree, n => n.type === 'button' && n.props.title === '删除')[0].props.onClick();
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'kb-2' } });
  harness.render(); await harness.flush(); deletion.resolve(); await pending;
  tree = await harness.flush();
  assert.deepEqual(calls, ['kb-1', 'kb-2']);
  assert.equal(nodes(tree, n => n.type === 'select')[0].props.value, 'kb-2');
});

test('detached reading history can be viewed without offering general chat or KB switching', async () => {
  const router = { push() {} };
  const harness = componentHarness('../src/app/conversations/view/page.tsx', 'ConversationDetailContent', {
    getMe: async () => ({ id: 'user' }), listKnowledgeBases: async () => [],
    listConversations: async () => [{ id: 'reading', type: 'READING', knowledgeBaseId: null, title: '历史' }],
  }, { 'next/navigation': { useRouter: () => router }, '@/lib/useConversationStream': {
    useConversationStream: () => ({ displayMessages: [], loading: false, sending: false, input: '不能发送',
      setInput() {}, handleSend() { assert.fail('History must remain read-only'); }, canSend: true }),
  } });
  const props = { conversationId: 'reading' }; harness.render(props);
  const tree = await harness.flush(props);
  assert.equal(nodes(tree, n => n.type === 'textarea')[0].props.disabled, true);
  assert.equal(nodes(tree, n => n.props?.className === 'sendBtn')[0].props.disabled, true);
  const switcher = nodes(tree, n => n.type === 'button' && String(n.props.className).includes('kbSwitcher'))[0];
  assert.equal(switcher.props.disabled, true);
});
