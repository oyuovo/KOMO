"""Pinned real-document retrieval + production reading-context evaluation.

Generation is opt-in, limited to <=12 explicitly marked human-review cases.
All Qdrant operations use a unique temporary collection, never the application collection.
"""
import argparse
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
import logging
from pathlib import Path
from statistics import median
from time import monotonic, sleep
from unittest.mock import patch
from uuid import uuid4

from qdrant_client import QdrantClient

from app.reading.core import Document, split_document
from app.reading.runtime import ReadingRuntime
from .embedding import LocalEmbedding
from .engine import HybridRetrieval, revision
from .reading import prepare_hybrid


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_suite(root):
    manifest_path, cases_path = root/'sources.json', root/'cases.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    suite = json.loads(cases_path.read_text(encoding='utf-8'))
    if digest(manifest_path) != suite['source_manifest_sha256']:
        raise ValueError('Source manifest changed after labels were frozen')
    documents = {}
    for source in manifest['documents']:
        path = (root/source['path']).resolve()
        if not path.is_relative_to(root.resolve()) or digest(path) != source['sha256']:
            raise ValueError('Source checksum/path mismatch: '+source['id'])
        documents[source['id']] = Document(source['id'], source['title'], path.read_bytes().decode('utf-8'))
    ids = set()
    for case in suite['cases']:
        if case['id'] in ids:
            raise ValueError('Duplicate case ID')
        ids.add(case['id'])
        if not case['reading_ids'] or not set(case['reading_ids']) <= documents.keys():
            raise ValueError('Unknown reading document')
        if case['answerable'] is True and not case['evidence']:
            raise ValueError('Answerable case needs labelled evidence')
        for evidence in case['evidence']:
            text = documents[evidence['document_id']].content
            start, end = evidence['start_offset'], evidence['end_offset']
            if not 0 <= start < end <= len(text) or text[start:end] != evidence['quote']:
                raise ValueError('Invalid gold span: '+case['id'])
    return manifest, suite, documents


def covered(evidence, hits):
    """Union of contiguous source ranges, never text concatenated across documents/gaps."""
    position = evidence['start_offset']
    for hit in sorted((h for h in hits if h['document_id'] == evidence['document_id']),
                      key=lambda h: h['start_offset']):
        if hit['end_offset'] <= position:
            continue
        if hit['start_offset'] > position:
            break
        position = hit['end_offset']
        if position >= evidence['end_offset']:
            return True
    return False


def score(evidence, hits):
    if not evidence:
        return None  # No-answer and human-pending are NOT zero-recall or automatic passes.
    at = lambda k: [covered(e, hits[:k]) for e in evidence]
    first = next((i for i in range(1, min(5,len(hits))+1) if any(at(i))), None)
    return {**{f'evidence_recall_at_{k}': sum(at(k))/len(evidence) for k in (3,5)},
            **{f'all_evidence_at_{k}': all(at(k)) for k in (3,5)},
            'mrr_at_5': 1/first if first else 0}


def reading_document(case, documents):
    ids = case['reading_ids']
    if len(ids) == 1:
        return documents[ids[0]], {ids[0]:0}
    # Explicit composite reading document, not KB retrieval: every original byte of text remains.
    content, offsets = '', {}
    for ident in ids:
        content += f'\n\n# Source: {documents[ident].title}\n\n'
        offsets[ident] = len(content)
        content += documents[ident].content
    return Document('reading-'+case['id'], 'Agent learning source pack', content), offsets


def aggregate(rows):
    groups = defaultdict(list)
    for row in rows:
        for strategy, result in row['retrieval'].items():
            for group in ('all', 'language:'+row['language'], 'category:'+row['category']):
                groups[(strategy,group)].append(result)
    output = {}
    for (strategy, group), values in groups.items():
        scored = [v['metrics'] for v in values if v['metrics'] is not None]
        output.setdefault(strategy,{})[group] = {
            'queries':len(values), 'scored_queries':len(scored),
            'median_ms':round(median(v['elapsed_ms'] for v in values),2),
            'metrics':({key:sum(v[key] for v in scored)/len(scored) for key in scored[0]} if scored else None)}
    return output


def write_report(output, report):
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = output.with_suffix(output.suffix+'.tmp')
    temp.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # Windows indexers/antivirus may briefly hold a read handle on a growing report.
    for attempt in range(6):
        try:
            temp.replace(output)
            break
        except PermissionError:
            if attempt == 5:
                raise
            sleep(.1 * (attempt+1))


async def run(args):
    root = args.suite.resolve()
    manifest, suite, documents = load_suite(root)
    review = [c for c in suite['cases'] if c['human_review']]
    if args.generate and len(review) > 12:
        raise ValueError('Refusing more than 12 real generation calls')
    model = LocalEmbedding()
    client = QdrantClient(url=args.url,timeout=30) if args.url else QdrantClient(':memory:')
    collection = 'komo_learning_eval_'+uuid4().hex
    engine = HybridRetrieval(client,model,collection)
    owner = 'learning-evaluation-'+uuid4().hex
    report = dict(suite_id=suite['id'], started_at=datetime.now(timezone.utc).isoformat(),
                  source_manifest_sha256=digest(root/'sources.json'), cases_sha256=digest(root/'cases.json'),
                  backend='qdrant-server' if args.url else 'qdrant-local', embedding_model=model.name,
                  embedding_identity=model.identity, temporary_collection=collection, state='running',
                  code_sha256={p.name:digest(p) for p in [Path(__file__),Path(__file__).with_name('engine.py'),
                              Path(__file__).with_name('lexical.py'),Path(__file__).with_name('embedding.py'),
                              Path(__file__).with_name('reading.py'),Path(__file__).parents[1]/'reading/core.py']},
                  documents=[{**s,'chunks':len(split_document(documents[s['id']].content))} for s in manifest['documents']],
                  limitations=['Provisional assistant span labels, not independent human gold.',
                               'User questions were seen by the curator and informed source selection.',
                               'MDX source snapshots include Python/JS and markup; external snippets/images are not expanded.',
                               'Recall is labelled source-span coverage, not semantic answer correctness.',
                               'Reading mode is document-scoped; multi-source cases use an explicit composite reading document.',
                               'Generation uses production Python reading preparation/runtime/provider, not browser/Java HTTP.',
                               'Serial warmed queries, not a latency/availability/load benchmark.'],results=[])
    started = monotonic()
    try:
        for doc in documents.values():
            await asyncio.to_thread(engine.index,owner,doc)
            print('Indexed '+doc.id,flush=True)
        report['index_elapsed_seconds'] = round(monotonic()-started,2)
        scope = [{'id':d.id,'revision':revision(d)} for d in documents.values()]
        prepared_cases = {}
        with patch('app.retrieval.reading.get_retrieval',return_value=engine):
            for case in suite['cases']:
                row = {**case,'retrieval':{}}
                # Rotate order deterministically to reduce a fixed first-channel warm-up advantage.
                strategies = ['lexical','dense','hybrid']
                offset = len(report['results']) % 3
                for strategy in strategies[offset:]+strategies[:offset]:
                    begin = monotonic()
                    hits = await asyncio.to_thread(engine.search,owner,scope,case['question'],5,strategy)
                    row['retrieval'][strategy] = dict(hits=hits,metrics=score(case['evidence'],hits),
                                                       elapsed_ms=round((monotonic()-begin)*1000))
                doc, offsets = reading_document(case,documents)
                prepared = await prepare_hybrid(doc,case['question'],user_id=owner)
                evidence = [{**e,'document_id':doc.id,'start_offset':e['start_offset']+offsets[e['document_id']],
                             'end_offset':e['end_offset']+offsets[e['document_id']]} for e in case['evidence']]
                hits = [{**s,'document_id':doc.id} for s in prepared.context['sources']]
                row['reading'] = dict(context=prepared.context,
                    required_evidence=len(evidence),
                    evidence_hits=sum(covered(e,hits) for e in evidence) if evidence else None,
                    prefix_12000_hits=sum(e['end_offset']<=12000 for e in evidence) if evidence else None)
                if case['human_review']:
                    prepared_cases[case['id']] = (doc,prepared)
                    row['generation_request'] = dict(messages=prepared.messages,
                        context=prepared.context, model_parameters={'temperature':0.2,'max_tokens':2048},
                        state='not_sent')
                report['results'].append(row)
                write_report(args.output,report)
                print('Evaluated '+case['id'],flush=True)
        report['aggregate'] = aggregate(report['results'])
        if args.generate:
            # Lazy import: retrieval-only runs never require credentials or instantiate provider clients.
            from app.api.reading import model_stream
            from app.core.config import DEEPSEEK_MODEL
            report['generation'] = dict(model=DEEPSEEK_MODEL,max_cases=len(review),max_output_tokens_per_case=2048,
                                        actual_token_usage=None, note='Provider stream does not expose usage here; not a measured cost.')
            for row in report['results']:
                if not row['human_review']:
                    continue
                doc, prepared = prepared_cases[row['id']]
                async def frozen_preparer(*_args):
                    return prepared
                runtime = ReadingRuntime(model_stream,preparer=frozen_preparer)
                answer, final_context = '', None
                try:
                    async for event in runtime.stream(doc,row['question'],user_id=owner):
                        if event['type']=='token':
                            answer += event['data']
                        else:
                            final_context = event['data']
                    row['generation'] = dict(state='completed',answer=answer,context=final_context,human_grade=None)
                except Exception as error:
                    # Keep partial output visibly failed; never grade it as a completed answer.
                    row['generation'] = dict(state='failed',error_type=type(error).__name__,
                                             partial_answer=answer,human_grade=None)
                    if getattr(error,'status_code',None) in (401,402,403):
                        write_report(args.output,report)
                        raise RuntimeError('Provider credentials/billing refused; stopping further calls') from None
                write_report(args.output,report)
                print('Generated '+row['id']+' '+row['generation']['state'],flush=True)
        report['state']='completed'
    except BaseException:
        report['state']='failed'
        raise
    finally:
        try:
            if client.collection_exists(collection):
                client.delete_collection(collection)
            report['temporary_collection_cleaned']=True
        except Exception:
            logging.exception('Failed cleaning temporary collection %s',collection)
            report['temporary_collection_cleaned']=False
        finally:
            client.close()
            report['elapsed_seconds']=round(monotonic()-started,2)
            write_report(args.output,report)
    print(json.dumps({'state':report['state'],'queries':len(report['results']),
                      'aggregate':{k:v['all'] for k,v in report['aggregate'].items()}},ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--suite',type=Path,default=Path('evals/agent-learning'))
    parser.add_argument('--url',help='Optional Qdrant server; unique disposable collection')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--generate',action='store_true',help='Call configured generation provider for the marked review subset')
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__=='__main__':
    main()
