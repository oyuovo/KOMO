"""Generate answers for explicitly approved, frozen requests. Does not re-run retrieval.

Requires --expected-sha256 to match the request artifact reviewed by the operator.
Provider credentials must already be in environment; never read a project .env here.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from app.reading.core import Document, PreparedReading
from app.reading.runtime import ReadingRuntime
from .evaluate_learning import write_report


async def run(args):
    data = args.requests.read_bytes()
    actual = hashlib.sha256(data).hexdigest()
    if actual != args.expected_sha256:
        raise ValueError('Requests differ from the approved artifact')
    requests = [json.loads(line) for line in data.decode('utf-8').splitlines() if line.strip()]
    if not 1 <= len(requests) <= 12 or len({r['id'] for r in requests}) != len(requests):
        raise ValueError('Expected 1-12 unique requests')
    case_id = getattr(args,'case_id',None)
    if case_id:
        requests = [request for request in requests if request['id']==case_id]
        if not requests:
            raise ValueError('Selected case is not in the approved artifact')
    if args.output.exists():
        raise ValueError('Output already exists; choose a new path to preserve prior answers')
    for request in requests:
        if request['model_parameters']!={'temperature':.2,'max_tokens':2048}:
            raise ValueError('Unexpected model parameters')
        if any(m['role'] not in {'system','user'} for m in request['messages']):
            raise ValueError('Only approved system and user messages are permitted')
        if sum(len(m['content']) for m in request['messages'])>30000:
            raise ValueError('Request exceeds evaluation character limit')
    from app.api.reading import model_stream
    from app.core.config import DEEPSEEK_MODEL
    from app.core.clients import adeepseek
    report = dict(started_at=datetime.now(timezone.utc).isoformat(),requests_sha256=actual,
                  model=DEEPSEEK_MODEL,endpoint='https://api.deepseek.com/v1/chat/completions',
                  selected_case_ids=[r['id'] for r in requests],
                  state='running',actual_token_usage=None,results=[])
    try:
        for request in requests:
            prepared = PreparedReading(request['messages'],request['context'])
            async def frozen_preparer(*_args):
                return prepared
            # Preparation is already frozen; the runtime uses the saved original source context.
            doc = Document(prepared.context['document_id'],prepared.context['document_title'],'')
            runtime = ReadingRuntime(model_stream,preparer=frozen_preparer)
            row = dict(id=request['id'],question=request['question'],state='running',human_grade=None)
            answer = ''
            try:
                async for event in runtime.stream(doc,request['question'],user_id='approved-learning-evaluation'):
                    if event['type']=='token':
                        answer += event['data']
                    else:
                        row['context']=event['data']
                row.update(state='completed',answer=answer)
            except Exception as error:
                row.update(state='failed',error_type=type(error).__name__,partial_answer=answer)
                if getattr(error,'finish_reason',None) in {'length','content_filter'}:
                    row['finish_reason']=error.finish_reason
                report['results'].append(row)
                write_report(args.output,report)
                if getattr(error,'status_code',None) in (401,402,403):
                    raise RuntimeError('Provider credentials/billing refused; no further requests sent') from None
                print('Generated '+request['id']+' failed',flush=True)
                continue
            report['results'].append(row)
            write_report(args.output,report)
            print('Generated '+request['id']+' completed',flush=True)
        report['state']='completed' if all(r['state']=='completed' for r in report['results']) else 'partial_failure'
    except BaseException:
        report['state']='failed'
        raise
    finally:
        await adeepseek.close()
        write_report(args.output,report)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--requests',type=Path,required=True)
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--case-id',help='Run only this case from the approved artifact; use a new output file')
    parser.add_argument('--output',type=Path,required=True)
    asyncio.run(run(parser.parse_args()))


if __name__=='__main__':
    main()
