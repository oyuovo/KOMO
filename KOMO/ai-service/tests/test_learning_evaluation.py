import copy
import asyncio
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, Mock

from app.retrieval.evaluate_learning import covered, load_suite, score, write_report
from app.retrieval.generate_learning import run as generate


class LearningEvaluationTest(unittest.TestCase):
    def test_generation_selection_cannot_add_an_unapproved_case(self):
        data=json.dumps({'id':'approved'}).encode()
        requests=Mock()
        requests.read_bytes.return_value=data
        args=SimpleNamespace(requests=requests,expected_sha256=hashlib.sha256(data).hexdigest(),case_id='not-approved')
        with self.assertRaisesRegex(ValueError,'not in the approved artifact'):
            asyncio.run(generate(args))

    def test_generation_refuses_changed_approval_artifact_before_provider_import(self):
        requests = Mock()
        requests.read_bytes.return_value=b'changed request'
        with self.assertRaisesRegex(ValueError,'approved artifact'):
            asyncio.run(generate(SimpleNamespace(requests=requests,expected_sha256='old')))

    def test_report_retries_transient_windows_read_lock(self):
        with patch.object(Path,'mkdir'), patch.object(Path,'write_text'), \
             patch.object(Path,'replace',side_effect=[PermissionError(),None]) as replace, \
             patch('app.retrieval.evaluate_learning.sleep') as pause:
            write_report(Path('report.json'),{'state':'completed'})
            self.assertEqual(replace.call_count,2)
            pause.assert_called_once()

    def test_source_identity_and_contiguous_ranges(self):
        evidence = dict(document_id='a',start_offset=3,end_offset=9)
        self.assertFalse(covered(evidence,[dict(document_id='b',start_offset=0,end_offset=10)]))
        self.assertTrue(covered(evidence,[dict(document_id='a',start_offset=0,end_offset=5),
                                          dict(document_id='a',start_offset=5,end_offset=12)]))
        self.assertFalse(covered(evidence,[dict(document_id='a',start_offset=0,end_offset=5),
                                           dict(document_id='a',start_offset=6,end_offset=12)]))

    def test_multi_evidence_is_not_any_hit_success(self):
        evidence = [dict(document_id='a',start_offset=0,end_offset=5),dict(document_id='b',start_offset=0,end_offset=5)]
        result = score(evidence,[dict(document_id='a',start_offset=0,end_offset=10)])
        self.assertEqual(result['evidence_recall_at_3'],.5)
        self.assertFalse(result['all_evidence_at_3'])
        self.assertEqual(result['mrr_at_5'],1)
        self.assertIsNone(score([],[]))

    def test_suite_spans_and_checksums(self):
        root = Path(__file__).resolve().parents[1]/'evals/agent-learning'
        manifest,suite,documents = load_suite(root)
        self.assertEqual(len(documents),len(manifest['documents']))
        self.assertEqual(sum(c['origin']=='user-verbatim' for c in suite['cases']),4)
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp)
            changed = copy.deepcopy(suite)
            changed['source_manifest_sha256']='wrong'
            (target/'sources.json').write_bytes((root/'sources.json').read_bytes())
            (target/'cases.json').write_text(json.dumps(changed),encoding='utf-8')
            with self.assertRaisesRegex(ValueError,'manifest changed'):
                load_suite(target)


if __name__=='__main__':
    unittest.main()
