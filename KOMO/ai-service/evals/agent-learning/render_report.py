"""Render local evaluation evidence and a human-review worksheet; no network calls."""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    report = json.loads((ROOT/'results/baseline.json').read_text(encoding='utf-8'))
    if report['state']!='completed':
        raise ValueError('Cannot publish an incomplete baseline as a completed report')
    docs = {d['id']:d for d in report['documents']}
    rows = report['results']
    answers_path = ROOT/'results/answers.json'
    answers = json.loads(answers_path.read_text(encoding='utf-8')) if answers_path.exists() else None
    answer_rows = {r['id']:r for r in answers['results']} if answers else {}
    retry_path = ROOT/'results/answers-retry-u04.json'
    retry = json.loads(retry_path.read_text(encoding='utf-8')) if retry_path.exists() else None
    if retry:
        if (not answers or retry['requests_sha256']!=answers['requests_sha256'] or retry['model']!=answers['model']
                or any(r['id']!='u04' for r in retry['results'])):
            raise ValueError('Retry does not match the approved u04 run')
        answer_rows.update({r['id']:r for r in retry['results']})
    generation_note = (f"真实生成已完成{sum(r['state']=='completed' for r in answer_rows.values())}/10题。"+
                       ('u04按原始输入及参数重试一次，首轮与重试记录分别保留。' if retry else '')+
                       '答案仍需人工评分，引用ID合法不代表结论有依据。'
                       if answers else '当前没有真实生成答案，外部发送等待明确授权；所有人工评分均为空。')
    lines = ['# Agent学习真实文档测评基线','',f"运行时间：{report['started_at']}。模型：`{report['embedding_model']}`。",
             '',f"{len(docs)}篇官方文档，{sum(d['characters'] for d in docs.values()):,}字符，{sum(d['chunks'] for d in docs.values())}片段，{len(rows)}题。",
             '', '问题、证据位置和文档版本在检索前固定。本轮没有调整生产检索、embedding、切块或融合规则。',
             '', '## 检索结果','',
             '前三/前五完整覆盖率要求找全该题标注的全部依据。证据召回率按题宏平均；MRR@5只表示第一条标注依据出现的位置。标注为暂定人工复核，不能称为真实用户准确率。',
             '', '| 语言组 | 通道 | 计分题数 | 依据召回@3 | 全部依据@3 | 全部依据@5 | MRR@5 |',
             '|---|---|---:|---:|---:|---:|---:|']
    for language in ('all','language:zh','language:en'):
        for strategy in ('lexical','dense','hybrid'):
            a = report['aggregate'][strategy][language]
            m = a['metrics']
            lines.append(f"| {language} | {strategy} | {a['scored_queries']} | {m['evidence_recall_at_3']:.1%} | {m['all_evidence_at_3']:.1%} | {m['all_evidence_at_5']:.1%} | {m['mrr_at_5']:.3f} |")
    by_id = {r['id']:r for r in rows}
    paired = [r for r in rows if r.get('pair_id')]
    lines += ['', '中文22题与英文8题题目构成不同，不能仅比较组均值归因。下面只比较同一批8道成对问题的前五完整依据覆盖：',
              '', '| 通道 | 中文原问 | 英文对照 |', '|---|---:|---:|']
    for strategy in ('lexical','dense','hybrid'):
        zh = sum(by_id[r['pair_id']]['retrieval'][strategy]['metrics']['all_evidence_at_5'] for r in paired)
        en = sum(r['retrieval'][strategy]['metrics']['all_evidence_at_5'] for r in paired)
        lines.append(f'| {strategy} | {zh}/{len(paired)} | {en}/{len(paired)} |')
    lines += ['', '样本较小，观察到语言相关差异，不能据此确定单一根因或统计显著性。下一版应分别比较多语embedding、文档语言分离与重排，保留本轮原始基线。']
    labelled = [r for r in rows if r['evidence']]
    complete = sum(r['reading']['evidence_hits']==r['reading']['required_evidence'] for r in labelled)
    prefix = sum(r['reading']['prefix_12000_hits']==r['reading']['required_evidence'] for r in labelled)
    lines += ['', '## 阅读上下文','',
              f'调用生产`prepare_hybrid`后，{complete}/{len(labelled)}题的最终上下文包含全部标注依据；仅截取前12000字符时为{prefix}/{len(labelled)}。这仍是上下文覆盖，不是答案正确率。',
              '', '知识库检索和阅读上下文分别测量：前者在17篇中检索，后者已经指定阅读文档；合并阅读包也明确给定来源。不能将二者直接当作同范围的策略胜负。',
              '', '## 混合检索前五未覆盖全部标注依据的题','', '| ID | 问题 | 标注来源 |', '|---|---|---|']
    for row in labelled:
        if not row['retrieval']['hybrid']['metrics']['all_evidence_at_5']:
            source = ', '.join(sorted(set(e['document_id'] for e in row['evidence'])))
            lines.append(f"| {row['id']} | {row['question']} | {source} |")
    lines += ['', '缺失某条精确标注不一定表示没有等价依据。请在HUMAN_REVIEW.md中复核候选，尤其是同一事实在多篇文档或Python/JS段落重复出现的情况。',
              '', '## 你的4道原始问题','', '| ID | 原话 | 混合检索前三候选 |', '|---|---|---|']
    for row in rows:
        if row['origin']=='user-verbatim':
            hits = ', '.join(h['document_id']+':'+str(h['start_line']) for h in row['retrieval']['hybrid']['hits'][:3])
            lines.append(f"| {row['id']} | {row['question']} | {hits} |")
    lines += ['', '用户题没有擅自补金标准，暂不计入自动成功率。3道无答案题同样不计入召回率，返回相似片段不等于应该回答。',
              '', '## 验证边界','',
              '- 真实Qdrant Server与缓存本地embedding；唯一临时集合已清理：'+str(report['temporary_collection_cleaned'])+'。',
              '- 英文原文含MDX、Python/JS并列内容，未展开图片或外链代码；这些是实际文档输入限制。',
              '- 相同中文问题的英文对照不是独立样本；语料由维护者挑选，题目主要由助手编写，必须人工复核。',
              '- 请求串行运行，模型已缓存；耗时记录不是负载或高可用测试。',
              '- '+generation_note,
              '- 首轮因Windows结果文件被暂时占用中断，保留interrupted.json；只修复评测结果写入重试后重跑，没有调检索。',
              '', '原始日志：[baseline.json](baseline.json)。文档校验与案例标签见上级sources.json、cases.json。']
    (ROOT/'results/REPORT.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    gold_lines = ['# 暂定金标准与等价证据复核','',
                  '优先复核a01-en、a13、a20-en：精确标注未覆盖不代表没有其他支持性证据。对每题写“真漏召回 / 有等价依据 / 标注不完整”，不要回写覆盖v1数据。',
                  '', '这是标注审核，不是回答评分；目前这些标签由助手提出。','']
    for row in labelled:
        if row['retrieval']['hybrid']['metrics']['all_evidence_at_5']:
            continue
        gold_lines += [f"## {row['id']}：{row['question']}",'','标注的必要依据：','']
        for e in row['evidence']:
            link=docs[e['document_id']]['source_url']+f"#L{e['start_line']}-L{e['end_line']}"
            gold_lines += [f"- [{e['document_id']} 第{e['start_line']}～{e['end_line']}行]({link})：{e['quote']}"]
        gold_lines += ['','实际混合检索前五候选：','']
        for hit in row['retrieval']['hybrid']['hits']:
            link=docs[hit['document_id']]['source_url']+f"#L{hit['start_line']}-L{hit['end_line']}"
            gold_lines += [f"- [{hit['document_id']} 第{hit['start_line']}～{hit['end_line']}行]({link})：{hit['heading']}"]
        gold_lines += ['','你的判断：________；理由/补充依据：________','']
    (ROOT/'results/GOLD_REVIEW.md').write_text('\n'.join(gold_lines)+'\n',encoding='utf-8')

    requests, review_lines = [], ['# 人工复核工作单','',
        '先看问题和证据，再检查回答。优先做u01～u04，再完成全部10道重点题。'+generation_note,
        '', '## 评分规则','',
        '在human-review.csv填写评分，留空表示未评，不等于0。',
        '', '- correctness：0=核心错误；1=部分正确但缺关键条件；2=正确且条件完整。',
        '- citation_support：0=引用不支持结论或伪造；1=部分结论没有依据；2=关键文档结论均被对应原文支持。补充解释必须明确标出。',
        '- uncertainty：0=编造缺失数值或绝对保证；1=边界模糊；2=清楚说明当前资料/片段的限制。',
        '- learning_value：0=仍不明白；1=能复述但不能应用；2=能用自己的例子解释并做出下一步。',
        '- critical_error：yes/no；例如把上下文更新说成训练、声称副作用绝不重复、声称结构化输出保证内容真实。出现关键错误则不能整体判通过。',
        '- retrieval_relevance：按前三候选逐条写0/1/2（无关/有帮助但不足/直接支持问题）；没有固定正确答案的推荐题尤其需要此项。',
        '', '## 额外需要你做的产品检查','',
        '1. 在测试知识库中导入选定原文，确认引用点击后看到的段落与回答一致；脚本没有替代浏览器交互验收。',
        '2. 对回答追问“为什么”“换一个例子呢”，检查条件是否丢失；本轮自动基线主要是单轮。',
        '3. 读后自行写3～5句理解或修改自己的笔记，判断是否更容易组织知识。不要仅按回答是否流畅打分。',
        '4. 对精确标注漏召回的题，检查其他候选是否包含等价证据。记录标注修订，不覆盖本轮冻结基线。',
        '', '## 重点题及证据','']
    csv_rows = []
    scope_lines = ['# 真实回答生成发送范围','',
        '目的地：项目已配置的DeepSeek API，`https://api.deepseek.com/v1/chat/completions`。',
        '范围：10道重点题（含用户原始4题）与它们的公开文档片段、阅读助理系统提示。没有账号资料、私人知识库、历史对话或密钥正文。API密钥仅用于正常请求认证。',
        '最多10次生成任务，每次最多2048输出token，生产客户端最多重试一次。费用以服务商实际计量为准；这里没有价格估算。',
        '实际messages保存在generation-requests.jsonl，清单创建时未发送；后续实际发送状态以answers.json为准。公开文档中的代码只作为文本，不执行。','',
        '| ID | 问题 | 原文来源 | 消息字符数 |','|---|---|---|---:|']
    for row in rows:
        if not row['human_review']:
            continue
        request = dict(id=row['id'],question=row['question'],**row['generation_request'])
        requests.append(request)
        chars = sum(len(m['content']) for m in request['messages'])
        scope_lines.append(f"| {row['id']} | {row['question']} | {', '.join(row['reading_ids'])} | {chars} |")
        review_lines += [f"### {row['id']}：{row['question']}",'',
                         '需要判断：'+row['expected_behavior'],'',
                         '阅读来源：'+', '.join(f"[{docs[d]['title']}]({docs[d]['source_url']})" for d in row['reading_ids']),
                         '']
        answer = answer_rows.get(row['id'])
        if answer and answer['state']=='completed':
            review_lines += ['模型回答（未人工评分）：','',answer['answer'],'',
                             '自动引用ID检查：`'+json.dumps(answer['context']['citations'],ensure_ascii=False)+'`。这不检查支持性。','',
                             '<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>','']
            for source in answer['context']['sources']:
                review_lines += [f"**[{source['id']}] {source['heading']}，阅读包第{source['start_line']}～{source['end_line']}行**",'',
                                 '> '+source['text'].replace('\n','\n> '),'']
            review_lines += ['</details>','']
        else:
            review_lines += ['回答：**'+('生成失败：'+answer['error_type']+'；结束原因：'+answer.get('finish_reason','首轮未记录') if answer else '待授权后生成，目前没有模型答案。')+'**','']
        review_lines += ['知识库混合检索前三候选（范围与上面的阅读文档不同）：','']
        for hit in row['retrieval']['hybrid']['hits'][:3]:
            review_lines += [f"- `{hit['document_id']}` 第{hit['start_line']}～{hit['end_line']}行，章节：{hit['heading']}",
                             '', '> '+hit['text'][:1000].replace('\n','\n> '),'']
        csv_rows.append(dict(id=row['id'],question=row['question'],correctness='',citation_support='',uncertainty='',
                             learning_value='',critical_error='',retrieval_relevance='',notes=''))
    requests_path = ROOT/'results/generation-requests.jsonl'
    requests_path.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in requests),encoding='utf-8')
    if answers and answers['requests_sha256']!=hashlib.sha256(requests_path.read_bytes()).hexdigest():
        raise ValueError('Answers were generated from different requests; refusing to mix runs')
    scope_lines += ['', '请求文件SHA256：`'+hashlib.sha256(requests_path.read_bytes()).hexdigest()+'`。']
    (ROOT/'results/GENERATION_SCOPE.md').write_text('\n'.join(scope_lines)+'\n',encoding='utf-8')
    (ROOT/'results/HUMAN_REVIEW.md').write_text('\n'.join(review_lines)+'\n',encoding='utf-8')
    if answers:
        answer_lines = ['# 真实模型回答：请先看你的4个问题','',
                        f"模型：`{answers['model']}`；原始批次生成时间（UTC）：{answers['started_at']}。",'',generation_note,'',
                        '以下是模型原始回答，未经改写，也未代替你评分。引用编号只验证了是否存在，是否支持结论须对照[原文证据工作单](HUMAN_REVIEW.md)。',
                        '', '评分可填[CSV](human-review.csv)，也可以直接反馈“题号＋哪里不明白/哪里不认同”。','']
        ordered = sorted(answer_rows.values(),key=lambda r:(0 if r['id'].startswith('u') else 1,r['id']))
        for answer in ordered:
            answer_lines += [f"## {answer['id']}：{answer['question']}",'']
            if answer['state']=='completed':
                answer_lines += [answer['answer'],'']
            else:
                answer_lines += ['生成未完成：`'+answer['error_type']+'`；结束原因：`'+answer.get('finish_reason','首轮未记录')+'`。部分输出不作为完整答案评分。','']
        (ROOT/'results/ANSWERS.md').write_text('\n'.join(answer_lines)+'\n',encoding='utf-8')
    csv_path = ROOT/'results/human-review.csv'
    if not csv_path.exists():  # Never overwrite the user's grades when refreshing views.
        with csv_path.open('w',encoding='utf-8-sig',newline='') as stream:
            writer = csv.DictWriter(stream,fieldnames=list(csv_rows[0]))
            writer.writeheader()
            writer.writerows(csv_rows)
    print('Rendered baseline report, 10 review cases and preserved frozen generation requests.')


if __name__=='__main__':
    main()
