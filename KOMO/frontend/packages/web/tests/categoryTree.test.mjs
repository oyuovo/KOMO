import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenCategoryTree, getSubtreeCategoryIds, isCategoryDescendant } from '../src/lib/categoryTree.ts';

const category = (id, path = 'root', sortOrder = 0) => ({ id, path, sortOrder, name: id });

test('tree order follows whole subtrees and sibling sortOrder, independently of response order', () => {
  const categories = [
    category('a-root', 'root', 2), category('a-child', 'root.z_root', 3),
    category('z-root', 'root', 1), category('b-child', 'root.z_root', 1),
    category('deep', 'root.z_root.b_child'), category('other', 'root.a_root'),
  ];
  const before = JSON.stringify(categories);
  const expected = ['z-root', 'b-child', 'deep', 'a-child', 'a-root', 'other'];
  assert.deepEqual(flattenCategoryTree(categories).map(row => row.category.id), expected);
  assert.deepEqual(flattenCategoryTree([...categories].reverse()).map(row => row.category.id), expected);
  assert.deepEqual(flattenCategoryTree(categories).map(row => row.depth), [0, 1, 2, 1, 0, 1]);
  assert.equal(JSON.stringify(categories), before);
});

test('equal sortOrder has stable ID ordering; empty trees are valid', () => {
  const categories = [category('z'), category('b'), category('a')];
  assert.deepEqual(flattenCategoryTree(categories).map(row => row.category.id), ['a', 'b', 'z']);
  assert.deepEqual(flattenCategoryTree([]), []);
});

test('missing-parent categories remain visible as roots and retain their own subtree', () => {
  const categories = [category('leaf', 'root.missing.orphan'), category('orphan', 'root.missing'), category('normal')];
  const rows = flattenCategoryTree(categories);
  assert.deepEqual(rows.map(row => [row.category.id, row.depth, row.hasChildren]),
    [['normal', 0, false], ['orphan', 0, true], ['leaf', 1, false]]);
});

test('collapsed ancestors hide the whole subtree even if their descendants are expanded', () => {
  const categories = [category('parent'), category('child', 'root.parent'), category('deep', 'root.parent.child')];
  assert.deepEqual(flattenCategoryTree(categories, new Set(['child'])).map(row => row.category.id), ['parent']);
  assert.deepEqual(flattenCategoryTree(categories, new Set(['parent'])).map(row => row.category.id), ['parent', 'child']);
  assert.equal(flattenCategoryTree(categories, new Set(['parent', 'child'])).length, 3);
});

test('ancestry and filtering compare complete ltree segments with UUID hyphen escaping', () => {
  const root = category('root-a');
  const child = category('child', 'root.root_a');
  const deep = category('deep', 'root.root_a.child');
  const lookalike = category('other', 'root.root_a_extra');
  assert.equal(isCategoryDescendant(child, root), true);
  assert.equal(isCategoryDescendant(deep, root), true);
  assert.equal(isCategoryDescendant(root, root), false);
  assert.equal(isCategoryDescendant(lookalike, root), false);
  assert.deepEqual([...getSubtreeCategoryIds(root.id, [root, child, lookalike, deep])], ['root-a', 'child', 'deep']);
  assert.deepEqual([...getSubtreeCategoryIds('missing', [root])], ['missing']);
});
