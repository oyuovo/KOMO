import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from qdrant_client import QdrantClient

from app.api.retrieval import router
from app.reading.core import Document
from app.retrieval.engine import HybridRetrieval, revision
from app.retrieval.lexical import bm25, fuse, tokenize
from app.retrieval.reading import prepare_hybrid


class TestEmbedding:
    """Protocol fake, not a semantic quality measurement."""
    identity = "unit-test-v1"
    dimension = 3

    def vectors(self, texts, query=False):
        return [[1.0, float('锁' in t), float('重试' in t)] for t in texts]


def manifest(*docs):
    return [{"id": d.id, "revision": revision(d)} for d in docs]


class RetrievalTest(unittest.TestCase):
    def setUp(self):
        self.client = QdrantClient(url=os.environ['QDRANT_TEST_URL']) if os.getenv('QDRANT_TEST_URL') else QdrantClient(":memory:")
        self.engine = HybridRetrieval(self.client, TestEmbedding(), 'komo_test_' + uuid4().hex)
        self.a = Document("same-id", "事务", "# 乐观锁\n版本冲突后重试。\n## 限制\n重试必须有上限。")
        self.b = Document("other", "错误码", "ERR_LOCK_409需要重新读取版本。")

    def tearDown(self):
        if self.client.collection_exists(self.engine.collection):
            self.client.delete_collection(self.engine.collection)
        self.client.close()

    def test_user_and_current_revision_filters_apply_before_both_rankings(self):
        foreign = Document(self.a.id, "别人的秘密", "只有另一个用户有权读取。")
        self.engine.index("a", self.a)
        self.engine.index("b", foreign)
        hits = self.engine.search("a", manifest(self.a), "别人的秘密")
        self.assertTrue(hits)
        self.assertTrue(all(h['title'] == '事务' for h in hits))
        self.assertEqual([self.a.id], self.engine.missing("b", manifest(self.a)))
        with self.assertRaises(ValueError):
            self.engine.search("b", manifest(self.a), "事务")

    def test_edit_delete_and_empty_scope_never_return_old_revisions(self):
        self.engine.index("a", self.a)
        edited = Document(self.a.id, "新版本", "新版本只讨论幂等性。")
        self.engine.index("a", edited)
        hits = self.engine.search("a", manifest(edited), "乐观锁")
        self.assertTrue(all(h['revision'] == revision(edited) for h in hits))
        self.assertEqual([], self.engine.search("a", [], "乐观锁"))
        self.assertGreater(self.engine.prune("a", manifest(edited)), 0)
        self.assertEqual([self.a.id], self.engine.missing("a", manifest(self.a)))
        self.assertEqual([], self.engine.missing("a", manifest(edited)))

    def test_failed_index_is_not_published_and_retry_is_idempotent(self):
        original = self.client.upsert
        calls = 0
        def fail_marker(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError('forced marker failure')
            return original(*args, **kwargs)
        with patch.object(self.client, 'upsert', side_effect=fail_marker):
            with self.assertRaises(RuntimeError):
                self.engine.index('a', self.a)
        self.assertEqual([self.a.id], self.engine.missing('a', manifest(self.a)))
        self.engine.index('a', self.a)
        count = self.client.count(self.engine.collection).count
        self.engine.index('a', self.a)
        self.assertEqual(count, self.client.count(self.engine.collection).count)

    def test_prune_keeps_other_users_and_current_evidence_matches_source(self):
        self.engine.index('a', self.a)
        self.engine.index('b', self.b)
        self.engine.prune('a', [])
        self.assertEqual([], self.engine.missing('b', manifest(self.b)))
        hits = self.engine.search('b', manifest(self.b), 'ERR_LOCK_409')
        for h in hits:
            self.assertEqual(self.b.content[h['start_offset']:h['end_offset']], h['text'])

    def test_scope_change_does_not_reuse_previous_bm25_statistics(self):
        self.engine.index('a', self.a)
        self.engine.index('a', self.b)
        hits = self.engine.search('a', manifest(self.b), 'ERR_LOCK_409', strategy='lexical')
        self.assertEqual(self.b.id, hits[0]['document_id'])
        self.assertEqual(1, hits[0]['lexical_rank'])
        self.assertEqual([], self.engine.search('a', manifest(self.a), 'ERR_LOCK_409', strategy='lexical'))

    def test_bm25_exact_terms_length_normalization_and_fusion(self):
        docs = [tokenize('ERR_LOCK_409事务冲突'), tokenize('ERR_LOCK_409 ' + '无关内容 ' * 200), tokenize('网络超时')]
        ranked = bm25('ERR_LOCK_409', docs)
        self.assertEqual(0, ranked[0][0])
        self.assertGreater(ranked[0][1], ranked[1][1])
        self.assertEqual('b', fuse([['a', 'b'], ['b', 'c']])[0][0])
        self.assertIn('err_lock_409', tokenize('发生ERR_LOCK_409错误'))

    def test_explicit_identifier_in_heading_is_not_diluted_by_dense_rank(self):
        specific = Document('specific', '错误', '# ERR_NET_408\n请求超时。')
        other = Document('other', '错误', '# ERR_LOCK_409\n这和ERR_NET_408不同。')
        self.engine.index('a', specific)
        self.engine.index('a', other)
        hits = self.engine.search('a', manifest(specific, other), 'ERR_NET_408是什么？')
        self.assertEqual('specific', hits[0]['document_id'])

    def test_internal_auth_and_duplicate_manifest_validation(self):
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client, patch.dict(os.environ, {'AI_INTERNAL_TOKEN': 'unit-only-token-01234567890123456789'}):
            body = {'user_id': 'a', 'manifest': manifest(self.a)}
            self.assertEqual(403, client.post('/api/retrieval/missing', json=body).status_code)
            headers = {'X-Internal-Token': os.environ['AI_INTERNAL_TOKEN']}
            with patch('app.api.retrieval.get_retrieval', return_value=self.engine):
                self.assertEqual([self.a.id], client.post('/api/retrieval/missing', json=body, headers=headers).json()['missing'])
                index = client.post('/api/retrieval/index', json={'user_id': 'a', 'document': self.a.__dict__}, headers=headers)
                self.assertTrue(index.json()['indexed'])
                search = client.post('/api/retrieval/search', json={**body, 'query': '锁'}, headers=headers)
                self.assertTrue(search.json()['hits'])
            body['manifest'] *= 2
            self.assertEqual(422, client.post('/api/retrieval/missing', json=body, headers=headers).status_code)
        with TestClient(app) as client, patch.dict(os.environ, {'AI_INTERNAL_TOKEN': ''}):
            self.assertEqual(503, client.post('/api/retrieval/missing', json={'user_id': 'a', 'manifest': []}).status_code)


class ReadingHybridTest(unittest.IsolatedAsyncioTestCase):
    async def test_long_reading_uses_same_hybrid_engine_and_exact_tail_evidence(self):
        client = QdrantClient(':memory:')
        self.addCleanup(client.close)
        engine = HybridRetrieval(client, TestEmbedding())
        doc = Document('long', '事务', '# 背景\n' + '背景资料与无关介绍。\n' * 1300
                       + '# ERR_LOCK_409\n冲突后必须重新读取版本，不能直接重复旧语句。')
        with patch('app.retrieval.reading.get_retrieval', return_value=engine):
            result = await prepare_hybrid(doc, 'ERR_LOCK_409怎么处理？', user_id='a')
        self.assertEqual('hybrid_sections', result.context['mode'])
        self.assertIn('retrieval', result.context)
        self.assertTrue(any('不能直接重复旧语句' in source['text'] for source in result.context['sources']))
        self.assertLessEqual(result.context['context_chars'], 12000)
        for source in result.context['sources']:
            self.assertEqual(doc.content[source['start_offset']:source['end_offset']], source['text'])

    async def test_retrieval_failure_does_not_silently_fall_back_to_lexical(self):
        doc = Document('long', '标题', '很长的原文。' * 3000)
        with patch('app.retrieval.reading.get_retrieval', side_effect=RuntimeError('offline')):
            with self.assertRaises(RuntimeError):
                await prepare_hybrid(doc, '解释', user_id='a')

    async def test_short_document_keeps_full_text_without_retrieval(self):
        with patch('app.retrieval.reading.get_retrieval', side_effect=AssertionError('should not retrieve')):
            result = await prepare_hybrid(Document('short', '标题', '完整原文。'), '解释', user_id='a')
        self.assertEqual('full_document', result.context['mode'])


if __name__ == '__main__':
    unittest.main()
