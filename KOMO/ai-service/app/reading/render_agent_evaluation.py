"""Render recorded agent runs; all semantic grades remain for human review."""
import argparse
import json
from pathlib import Path
import re

from app.retrieval.evaluate_learning import covered, digest


def evidence_metrics(case, context):
    ident = case['document']['id']
    gold = [{**e, 'document_id': ident,
             'start_offset': e['start_offset'] + case['source_offsets'][e['document_id']],
             'end_offset': e['end_offset'] + case['source_offsets'][e['document_id']]} for e in case['evidence']]
    hits = [{**s, 'document_id': ident} for s in context.get('sources', [])]
    return {'required': len(gold), 'covered': sum(covered(e, hits) for e in gold) if gold else None}


def summarize(manifest, report):
    cases = {c['id']: c for c in manifest['cases']}
    rows = []
    for result in report['results']:
        calls = [r for r in report['requests'] if r['variant'] == result['variant']]
        context = result.get('context', {})
        trace = context.get('agent', {})
        usage = [r['usage'] for r in calls if r.get('usage')]
        rows.append({'variant': result['variant'], 'id': result['id'], 'max_rounds': result['max_rounds'],
            'state': result['state'], 'elapsed_ms': result['elapsed_ms'], 'requests': len(calls),
            'usage_records': len(usage), 'input_tokens_recorded': sum(u.get('prompt_tokens', 0) for u in usage),
            'output_tokens_recorded': sum(u.get('completion_tokens', 0) for u in usage),
            'stop_reason': trace.get('stop_reason'), 'actual_rounds': trace.get('rounds'),
            'tool_calls': len(trace.get('steps', [])),
            'initial_evidence': evidence_metrics(cases[result['id']], cases[result['id']]['initial_context']),
            'final_evidence': evidence_metrics(cases[result['id']], context),
            'citations': context.get('citations'), 'human_grade': None})
    groups = {}
    for rounds in manifest['round_limits']:
        group = [r for r in rows if r['max_rounds'] == rounds]
        groups[str(rounds)] = {'runs': len(group), 'completed': sum(r['state'] == 'completed' for r in group),
            'requests': sum(r['requests'] for r in group), 'tool_calls': sum(r['tool_calls'] for r in group),
            'mean_elapsed_ms': round(sum(r['elapsed_ms'] for r in group) / len(group)) if group else None,
            'recorded_input_tokens': sum(r['input_tokens_recorded'] for r in group),
            'recorded_output_tokens': sum(r['output_tokens_recorded'] for r in group),
            'usage_records': sum(r['usage_records'] for r in group)}
    return {'groups': groups, 'rows': rows, 'limitations': report['limitations']}


def render(manifest, report, summary):
    lines = ['# 真实Agent：0/1/2轮开发回归', '',
             '同一生成模型、相同初始证据，比较补读上限。没有独立留出题，每格仅运行一次；不能据此证明最优轮数。',
             '', '引用编号存在不代表支持结论，证据覆盖不代表回答正确。以下语义评分留空，由用户复核。', '',
             '| 上限 | 完成 | API请求 | 工具调用 | 平均耗时 | 已记录输入/输出tokens |',
             '|---|---:|---:|---:|---:|---:|']
    for limit, group in summary['groups'].items():
        lines.append(f"| {limit} | {group['completed']}/{group['runs']} | {group['requests']} | {group['tool_calls']} | "
                     f"{group['mean_elapsed_ms']/1000:.1f}s | {group['recorded_input_tokens']}/{group['recorded_output_tokens']} |")
    lines.extend(['', '部分失败请求可能没有usage，tokens只累计实际收到的用量，不代表失败调用免费。未换算费用。', ''])
    by_variant = {r['variant']: r for r in summary['rows']}
    for case in manifest['cases']:
        lines.extend(['## ' + case['id'] + '：' + case['question'], '', '复核重点：' + case['expected_behavior'], ''])
        for row in sorted((r for r in report['results'] if r['id'] == case['id']), key=lambda r: r['max_rounds']):
            metrics = by_variant[row['variant']]
            context = row.get('context', {})
            lines.extend([f"### 最多{row['max_rounds']}轮：{row['state']}", '',
                f"耗时{row['elapsed_ms']/1000:.1f}s；API请求{metrics['requests']}次；停止原因：{metrics['stop_reason']}。", '',
                row.get('answer', row.get('partial_answer', '')) or '没有回答正文。', '',
                '**人工复核：**条件是否完整：____；引用是否支持：____；是否误导：____；学习帮助：____。', '',
                '<details><summary>工具轨迹和本轮实际证据</summary>', '', '```json',
                json.dumps(context.get('agent', {}), ensure_ascii=False, indent=2), '```', ''])
            for source in context.get('sources', []):
                fence = '`' * max(3, 1 + max((len(m) for m in re.findall(r'`+', source['text'])), default=0))
                lines.extend([f"{source['id']} · {source['heading']} · 当前阅读快照第{source['start_line']}—{source['end_line']}行", '',
                              fence + 'text', source['text'], fence, ''])
            lines.extend(['</details>', ''])
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--results', type=Path, required=True)
    parser.add_argument('--summary', type=Path, required=True)
    parser.add_argument('--review', type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    report = json.loads(args.results.read_text(encoding='utf-8'))
    if report['manifest_sha256'] != digest(args.manifest):
        raise ValueError('Result manifest differs')
    if report['state'] == 'running' or args.summary.exists() or args.review.exists():
        raise ValueError('Run unfinished or output already exists')
    summary = summarize(manifest, report)
    with args.summary.open('x', encoding='utf-8') as output:
        json.dump(summary, output, ensure_ascii=False, indent=2)
        output.write('\n')
    with args.review.open('x', encoding='utf-8') as output:
        output.write(render(manifest, report, summary))
    print(json.dumps(summary['groups'], ensure_ascii=False))


if __name__ == '__main__':
    main()
