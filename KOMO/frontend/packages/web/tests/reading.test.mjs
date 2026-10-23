import test from 'node:test';
import assert from 'node:assert/strict';
import { SseDecoder } from '../src/lib/sse.ts';
import { parseReadingContext } from '../src/lib/readingContext.ts';

test('SSE keeps multiline tokens, empty lines and metadata apart across every split', () => {
  const wire = 'event: reading_context\r\ndata: {"sources":[]}\r\n\r\nevent: token\ndata: \ndata: 中文\ndata: \n\nevent: done\ndata: {}\n\n';
  for (let i = 0; i <= wire.length; i++) {
    const parser = new SseDecoder();
    assert.deepEqual([...parser.push(wire.slice(0, i)), ...parser.push(wire.slice(i))], [
      { type: 'reading_context', data: '{"sources":[]}' },
      { type: 'token', data: '\n中文\n' },
      { type: 'done', data: '{}' },
    ]);
  }
});

test('SSE ignores comments and does not complete truncated events', () => {
  const parser = new SseDecoder();
  assert.deepEqual(parser.push(': heartbeat\n\nevent: done\ndata: {}'), []);
});

test('reading snapshots accept old missing metadata but reject malformed evidence', () => {
  assert.equal(parseReadingContext(null), null);
  assert.equal(parseReadingContext('{'), null);
  const context = { document_id: 'doc', document_hash: 'a'.repeat(64), mode: 'full_document', state: 'completed',
    sources: [{ id: 'S1', heading: '原文', start_line: 1, end_line: 2, text: '证据' }], warnings: [] };
  assert.equal(parseReadingContext(JSON.stringify(context)).sources[0].text, '证据');
  context.mode = 'hybrid_sections';
  assert.equal(parseReadingContext(JSON.stringify(context)).mode, 'hybrid_sections');
  context.sources[0].start_line = -1;
  assert.equal(parseReadingContext(JSON.stringify(context)), null);
});
