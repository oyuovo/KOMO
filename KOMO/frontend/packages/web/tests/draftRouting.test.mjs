import test from 'node:test';
import assert from 'node:assert/strict';
import { draftDestination, resolveDraftParent, processDraftSelection } from '../src/lib/draftRouting.ts';

const draft = { id: 'draft-1', relationType: 'SUPPLEMENTS', relationDetail: JSON.stringify({ parentEntryId: 'article-1' }) };

test('visible suggested parent is sent instead of the independent knowledge base', () => {
  assert.equal(resolveDraftParent(draft, undefined).id, 'article-1');
  assert.deepEqual(draftDestination(draft, undefined, 'base-1'), { parentEntryId: 'article-1', knowledgeBaseId: undefined });
});

test('explicit cancellation stays cancelled when confirming', () => {
  assert.equal(resolveDraftParent(draft, null), null);
  assert.deepEqual(draftDestination(draft, null, 'base-2'), { parentEntryId: undefined, knowledgeBaseId: 'base-2' });
});

test('manual parent overrides the suggestion', () => {
  const selected = { id: 'article-2', title: '手动选择的文章' };
  assert.deepEqual(draftDestination(draft, selected, 'base-1'), { parentEntryId: 'article-2', knowledgeBaseId: undefined });
});

test('suspected duplicate never implicitly becomes a supplement', () => {
  const duplicate = { ...draft, relationType: 'DUPLICATE' };
  assert.deepEqual(draftDestination(duplicate, undefined, 'base-1'), { parentEntryId: undefined, knowledgeBaseId: 'base-1' });
});

test('malformed relation can still be saved independently', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.equal(resolveDraftParent({ ...draft, relationDetail: '{' }, undefined), null);
});

test('mixed batch uses individual destinations and keeps only failures for retry', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const second = { ...draft, id: 'draft-2' };
  const third = { ...draft, id: 'draft-3' };
  const selections = { 'draft-2': null, 'draft-3': { id: 'article-3', title: '另一篇文章' } };
  const calls = [];
  const result = await processDraftSelection([draft, second, third], async (item) => {
    calls.push([item.id, draftDestination(item, selections[item.id], 'base-2')]);
    if (item.id === 'draft-2') throw new Error('target unavailable');
  });
  assert.deepEqual([...result.succeeded], ['draft-1', 'draft-3']);
  assert.deepEqual(result.failed, ['draft-2']);
  assert.deepEqual(calls, [
    ['draft-1', { parentEntryId: 'article-1', knowledgeBaseId: undefined }],
    ['draft-2', { parentEntryId: undefined, knowledgeBaseId: 'base-2' }],
    ['draft-3', { parentEntryId: 'article-3', knowledgeBaseId: undefined }],
  ]);
});
