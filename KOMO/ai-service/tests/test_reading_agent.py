import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import AsyncMock

from app.reading.agent import acquire_evidence, EvidenceTools, TOOL_CHARS
from app.reading.core import Document, CONTEXT_CHARS, prepare_reading, split_document
from app.reading.runtime import ReadingRuntime


def call(name, args, ident='call1'):
    return {'id': ident, 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(args)}}


class AgentTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_decisions_keep_capability_condition_and_missing_evidence_gains(self):
        from app.reading.replay_agent import replay
        root = Path(__file__).resolve().parents[1] / 'evals/agent-learning/results'
        report = await replay(root)
        for row in report['results']:
            context = row['context']
            self.assertLessEqual(context['context_chars'], CONTEXT_CHARS)
            self.assertLessEqual(len(context['sources']), 24)
            if row['id'] == 'u02':
                self.assertTrue(any('This works with all models that support tool calling' in s['text']
                                    for s in context['sources']), row['variant'])
            if row['old_gold']['covered'] is not None:
                self.assertGreaterEqual(row['new_gold']['covered'], row['old_gold']['covered'], row['variant'])
            if context['agent']['steps']:
                self.assertIn('omitted_initial_chunks', context['agent'])

    def setUp(self):
        self.doc = Document('doc', 'Scoped document', '# Background\n' + 'background.\n' * 1500 +
                            '\n## Capability\nOnly models supporting tool calls can use this.\n')
        self.chunks = split_document(self.doc.content)
        self.tail = len(self.chunks) - 1
        self.initial = prepare_reading(self.doc, 'Explain capability', ranked_indices=[0])

    async def test_search_then_read_uses_observations_and_final_exact_evidence(self):
        seen = []
        async def planner(messages, tools):
            seen.append(messages.copy())
            if len(seen) == 1:
                return {'tool_calls': [call('search_document', {'query': 'tool calls'})]}
            result = json.loads(messages[-1]['content'])
            return {'tool_calls': [call('read_section', {'start_chunk': result['sources'][0]['chunk_index']}, 'call2')]}
        searcher = AsyncMock(return_value=[{'chunk_index': self.tail}])
        final = await acquire_evidence(self.doc, 'Explain capability', [], '', 'owner', self.initial, planner, searcher)
        searcher.assert_awaited_once_with(self.doc, 'tool calls', 'owner')
        self.assertEqual(len(seen), 2)
        self.assertEqual(final.context['agent']['stop_reason'], 'round_limit')
        self.assertIn('Only models supporting', ''.join(s['text'] for s in final.context['sources']))
        for source in final.context['sources']:
            self.assertEqual(source['text'], self.doc.content[source['start_offset']:source['end_offset']])
        self.assertLessEqual(final.context['context_chars'], CONTEXT_CHARS)
        self.assertEqual(len(final.context['sources']), len({s['id'] for s in final.context['sources']}))

    async def test_short_document_skips_planner(self):
        doc = Document('doc', 'title', 'Complete source')
        planner = AsyncMock()
        prepared = prepare_reading(doc, 'Explain')
        result = await acquire_evidence(doc, 'Explain', [], '', 'owner', prepared, planner, AsyncMock())
        planner.assert_not_awaited()
        self.assertEqual(result.context['agent']['stop_reason'], 'full_document')

    async def test_round_configuration_is_enforced_in_code_and_prompt(self):
        for limit in (0, 1, 2, 3):
            prompts = []
            async def planner(messages, tools):
                prompts.append(messages[0]['content'])
                return {'tool_calls': [call('list_sections', {'start_chunk': len(prompts) - 1}, str(len(prompts)))]}
            result = await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial,
                                            planner, AsyncMock(), max_rounds=limit)
            self.assertEqual(len(prompts), limit)
            self.assertEqual(result.context['agent']['max_rounds'], limit)
            if prompts:
                self.assertIn(f'最多{limit}轮', prompts[0])
        for invalid in (-1, 4, True, '2'):
            with self.assertRaises(ValueError):
                ReadingRuntime(None, max_rounds=invalid)

    async def test_no_tools_is_a_stop_not_a_truth_judgment(self):
        planner = AsyncMock(return_value={'tool_calls': [], 'content': 'I verified everything! [S999]'})
        final = await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial, planner, AsyncMock())
        self.assertEqual(final.context['agent']['stop_reason'], 'model_stopped')
        self.assertNotIn('verified everything', str(final.messages))
        self.assertNotIn('answerable', final.context)

    async def test_repeated_calls_stop_without_repeating_search(self):
        planner = AsyncMock(side_effect=[{'tool_calls': [call('search_document', {'query': 'same'})]},
            {'tool_calls': [call('search_document', {'query': 'same'}, 'call2')]}])
        searcher = AsyncMock(return_value=[])
        result = await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial, planner, searcher)
        self.assertEqual(searcher.await_count, 1)
        self.assertEqual(result.context['agent']['stop_reason'], 'no_progress')

    async def test_bad_batch_has_no_partial_side_effects(self):
        cases = [call('delete_document', {}), call('read_section', {'start_chunk': -1}),
            call('read_section', {'start_chunk': True}),
            call('search_document', {'query': 'x', 'user_id': 'another-owner'}),
            call('read_section', {'start_chunk': self.tail + 1})]
        for bad in cases:
            searcher = AsyncMock()
            planner = AsyncMock(return_value={'tool_calls': [call('search_document', {'query': 'x'}, 'ok'), bad]})
            with self.assertRaises(ValueError):
                await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial, planner, searcher)
            searcher.assert_not_awaited()

    async def test_tool_count_and_duplicate_ids_are_rejected(self):
        for calls in [[call('list_sections', {'start_chunk': 0}, str(i)) for i in range(4)],
                      [call('list_sections', {'start_chunk': 0})] * 2]:
            with self.assertRaises(ValueError):
                await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial,
                    AsyncMock(return_value={'tool_calls': calls}), AsyncMock())

    async def test_planning_timeout_preserves_evidence_and_records_limit(self):
        closed = asyncio.Event()
        async def planner(*args):
            try:
                await asyncio.sleep(1)
            finally:
                closed.set()
        result = await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial,
                                        planner, AsyncMock(), planning_seconds=.01)
        self.assertTrue(closed.is_set())
        self.assertEqual(result.context['agent']['stop_reason'], 'planning_timeout')
        self.assertIn('agent_budget_limited', result.context['warnings'])

    async def test_provider_or_tool_failure_does_not_become_completed_answer(self):
        provider = AsyncMock()
        runtime = ReadingRuntime(provider, planner=AsyncMock(side_effect=RuntimeError('failed')), searcher=AsyncMock())
        with self.assertRaises(RuntimeError):
            async for _ in runtime.stream(self.doc, 'Explain', user_id='owner'):
                pass
        provider.assert_not_called()
        await asyncio.wait_for(runtime.slots.acquire(), .1)

    async def test_search_timeout_is_not_silently_reported_as_budget_exhaustion(self):
        planner = AsyncMock(return_value={'tool_calls': [call('search_document', {'query': 'x'})]})
        with self.assertRaisesRegex(TimeoutError, 'index failed'):
            await acquire_evidence(self.doc, 'Explain', [], '', 'owner', self.initial, planner,
                                   AsyncMock(side_effect=TimeoutError('index failed')))

    async def test_cancel_during_planning_releases_slot(self):
        entered, closed = asyncio.Event(), asyncio.Event()
        async def planner(*args):
            entered.set()
            try:
                await asyncio.sleep(10)
            finally:
                closed.set()
        runtime = ReadingRuntime(None, concurrency=1, planner=planner, searcher=AsyncMock())
        async def consume():
            async for _ in runtime.stream(self.doc, 'Explain', user_id='owner'):
                pass
        task = asyncio.create_task(consume())
        await asyncio.wait_for(entered.wait(), 1)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.assertTrue(closed.is_set())
        await asyncio.wait_for(runtime.slots.acquire(), .1)

    async def test_tool_budget_pagination_and_selection_survive_final_assembly(self):
        tools = EvidenceTools(self.doc, 'owner', AsyncMock())
        total = 0
        for i in range(6):
            result = await tools.execute('read_section', {'start_chunk': i})
            total += sum(len(s['text']) for s in result['sources'])
        self.assertLessEqual(total, TOOL_CHARS)
        self.assertGreaterEqual(tools.remaining, 0)
        self.assertTrue(result['partial_section'])
        outline = tools.outline(0)
        self.assertFalse(outline['body_read'])
        selection = 'Only models supporting tool calls can use this.'
        prepared = prepare_reading(self.doc, 'Explain', selection=selection)
        planner = AsyncMock(return_value={'tool_calls': [call('read_section', {'start_chunk': 0})]})
        # A second identical ID is a protocol error, so explicitly stop on round 2.
        planner.side_effect = [planner.return_value, {'tool_calls': []}]
        final = await acquire_evidence(self.doc, 'Explain', [], selection, 'owner', prepared, planner, AsyncMock())
        self.assertIn(selection, ''.join(s['text'] for s in final.context['sources']))

    async def test_reading_from_middle_cannot_claim_complete_section(self):
        tools = EvidenceTools(self.doc, 'owner', AsyncMock())
        # Last background chunk plus introduction fit, but skipped middle chunks do not disappear.
        result = await tools.execute('read_section', {'start_chunk': self.tail - 1})
        self.assertTrue(result['partial_section'])
        self.assertIsNotNone(result['next_chunk'])
        self.assertFalse(result['absence_proven'])

    async def test_final_answer_receives_only_final_sources_not_planner_transcript(self):
        received = []
        async def provider(messages):
            received.extend(messages)
            yield 'Evidence [S1]'
        planner = AsyncMock(return_value={'tool_calls': [], 'content': 'UNTRUSTED_PLANNER_CLAIM'})
        events = [e async for e in ReadingRuntime(provider, planner=planner, searcher=AsyncMock()).stream(
            self.doc, 'Explain', user_id='owner')]
        self.assertNotIn('UNTRUSTED_PLANNER_CLAIM', str(received))
        self.assertFalse(any(m['role'] == 'tool' for m in received))
        self.assertEqual(events[-1]['data']['state'], 'completed')
        self.assertIn('agent', events[-1]['data'])


class SectionRegressionTest(unittest.TestCase):
    def test_frozen_rankings_keep_both_reviewed_conditions_without_gold_relabelling(self):
        from app.reading.replay_context import replay
        root = Path(__file__).resolve().parents[1] / 'evals/agent-learning'
        report = replay(root)
        rows = {r['id']: r for r in report['results']}
        conditions = {'u01': 'you do **not** need to rebuild it',
                      'u02': 'This works with all models that support tool calling'}
        for ident, quote in conditions.items():
            self.assertEqual(rows[ident]['required_evidence'], 0)
            self.assertIsNone(rows[ident]['new_hits'])
            self.assertTrue(any(quote in s['text'] for s in rows[ident]['context']['sources']))
        self.assertEqual(report['summary']['regressed'], [])

    def test_real_tool_strategy_code_hit_keeps_section_capability_condition(self):
        path = Path(__file__).resolve().parents[1] / 'evals/agent-learning/sources/lg-structured.md'
        doc = Document('structured', 'Structured output', path.read_bytes().decode('utf-8'))
        chunks = split_document(doc.content)
        first = next(i for i, c in enumerate(chunks) if 'This works with all models that support tool calling' in c.text)
        # Hit a later code block in the same section, away from the opening condition.
        later = next(i for i in range(first + 2, len(chunks)) if chunks[i].heading == chunks[first].heading)
        context = prepare_reading(doc, 'ToolStrategy', ranked_indices=[later]).context
        self.assertTrue(any('This works with all models that support tool calling' in s['text'] for s in context['sources']))

    def test_real_rag_child_section_keeps_parent_sql_exception(self):
        path = Path(__file__).resolve().parents[1] / 'evals/agent-learning/sources/lg-retrieval.md'
        text = path.read_bytes().decode('utf-8')
        doc = Document('retrieval', 'Retrieval', text + '\n# Appendix\n' + 'unrelated\n' * 1600)
        chunks = split_document(doc.content)
        target = next(i for i, c in enumerate(chunks) if c.heading.endswith('Retrieval pipeline'))
        context = prepare_reading(doc, 'RAG pipeline', ranked_indices=[target]).context
        self.assertTrue(any('you do **not** need to rebuild it' in s['text'] for s in context['sources']))


if __name__ == '__main__':
    unittest.main()
