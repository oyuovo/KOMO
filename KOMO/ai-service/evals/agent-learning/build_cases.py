"""Rebuild exact-span labels; run BEFORE retrieval, never mine returned hits for labels."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
manifest = json.loads((ROOT / 'sources.json').read_text(encoding='utf-8'))
docs = {d['id']: (ROOT / d['path']).read_text(encoding='utf-8') for d in manifest['documents']}
cases = []

def add(ident, question, category, spans, expected, *, english=None, review=False):
    evidence = []
    for doc, quote in spans:
        content = docs[doc]
        start = content.index(quote)
        evidence.append(dict(document_id=doc, quote=quote, start_offset=start, end_offset=start+len(quote),
                             start_line=content.count('\n', 0, start)+1,
                             end_line=content.count('\n', 0, start+len(quote))+1))
    row = dict(id=ident, question=question, language='zh', category=category,
               origin='assistant-authored-before-run', gold_status='provisional', answerable=True,
               evidence=evidence, expected_behavior=expected, reading_ids=list(dict.fromkeys(d for d, _ in spans)),
               human_review=review)
    cases.append(row)
    if english:
        cases.append({**row, 'id': ident+'-en', 'question': english, 'language':'en', 'pair_id':ident, 'human_review':False})

add('a01', '给大模型发一句提示词，就算搭好了Agent吗？文中怎么定义Agent？', 'concept',
    [('hf-agents','An Agent is a system that leverages an AI model to interact with its environment in order to achieve a user-defined objective.')],
    '解释目标、模型与环境交互，不能把一次文本生成等同于完整Agent。',
    english='Does sending a prompt to an LLM make an agent? How does this course define an agent?')
add('a02', '模型说要查天气时，到底是谁执行函数？执行结果怎么回到模型？', 'paraphrase',
    [('hf-tools','The **Agent** then reads this response, identifies that a tool call is required, executes the tool on the LLM’s behalf, and retrieves the actual weather data.'),
     ('hf-tools','the Agent appends them as a new message before passing the updated conversation to the LLM again.')],
    '区分模型生成调用与运行时执行调用，并解释结果回填。', english='Who executes a weather tool call, and how does the result get back to the LLM?')
add('a03', '给Agent提供一个工具，最少需要描述哪些内容？返回值类型是否必填？', 'conditions',
    [('hf-tools','A **textual description of what the function does**.'),('hf-tools','(Optional) Outputs with typings.')],
    '说明描述、可调用对象、有类型的参数；输出类型在该课程列表中是可选。')
add('a04', '模型输出完一次动作后为什么要停下来，不能接着自己编后续结果吗？', 'paraphrase',
    [('hf-actions','This passes control from the LLM back to the agent and ensures the result is parseable'),
     ('hf-actions','An external parser reads the formatted action, determines which Tool to call, and extracts the required parameters.')],
    '说明停止生成、控制权交还运行时、解析和执行；不要把生成文本当作真实工具结果。')
add('a05', 'Code Agent可以生成可执行代码，是不是因此就能放心直接执行？', 'conditions',
    [('hf-actions','executing LLM-generated code may pose security risks, from prompt injection to the execution of harmful code.')],
    '不能保证安全；原文提示代码执行风险和框架防护，不应夸大为绝对安全。',review=True)
add('a06', '工具出错或返回数据以后，Agent下一轮怎么利用这些反馈？', 'paraphrase',
    [('hf-observations','**Appends Results:** Integrates the new information into its existing context, effectively updating its memory.'),
     ('hf-observations','**Adapts its Strategy:** Uses this updated context to refine subsequent thoughts and actions.')],
    '反馈加入上下文并用于下一步决策，不能说这是模型权重训练。')
add('a07', 'LangGraph里的State、节点和条件边各负责什么？', 'multi_evidence',
    [('hf-graph','It represents all the information that flows through your application.'),
     ('hf-graph','Takes the state as input'),('hf-graph','**Conditional**: Choose the next node based on the current state')],
    '说明状态数据、节点读取并返回更新、条件边根据状态路由。')
add('a08', '文档分析示例里的tools_condition有什么作用，调用工具后回哪里？', 'identifier',
    [('hf-document','tools_condition,'),('hf-document','builder.add_edge("tools", "assistant")')],
    '解释根据是否有工具调用路由到tools，否则直接回答；工具完成返回assistant。')
add('a09', 'Agentic RAG相对每次都先检索再回答，多了什么决定权？', 'concept',
    [('hf-rag','Alfred can decide to use any other tool or flow to answer the question.')],
    '说明可决定用其他工具或流程，不能仅因接入向量库就宣称是Agentic RAG。')
add('a10', '短期会话记忆与跨会话长期记忆应分别交给checkpointer还是store？', 'comparison',
    [('lg-persistence','**[Checkpointers](/oss/langgraph/checkpointers)** persist a thread\'s graph state as checkpoints.'),
     ('lg-persistence','**[Stores](/oss/langgraph/stores)** persist application-defined data outside the graph state.')],
    '区分thread内状态快照与跨thread应用数据；二者可同时使用。',
    english='How do checkpointers and stores differ for short-term thread memory and long-term cross-thread memory?')
add('a11', '进程重启以后，为什么MemorySaver里的聊天状态没了？该换什么？', 'identifier',
    [('lg-persistence','`MemorySaver` and `InMemorySaver` store checkpoints in RAM. When the process restarts, all checkpoints are lost.')],
    '解释内存不持久，生产使用持久化checkpointer；不把名字中的Saver误解为磁盘持久化。')
add('a12', '人工批准后恢复运行，thread_id换一个新的可以吗？', 'conditions',
    [('lg-interrupts','You must use the **same thread ID** when resuming that was used when the interrupt occurred')],
    '恢复必须使用相同thread_id；新ID意味着新线程空状态。')
add('a13', '为什么等我点批准后，批准之前的数据库写入又发生了一次？怎么避免重复副作用？', 'long_tail',
    [('lg-interrupts','side effects called before @[`interrupt`] should (ideally) be idempotent.'),
     ('lg-interrupts','Place side effects after @[`interrupt`] calls')],
    '说明节点恢复会重跑；使用幂等写入或把副作用放到中断后/独立节点，不能说从暂停行无副作用续跑。',
    english='Why can a database write before an interrupt run again after approval, and how can duplicate side effects be avoided?',review=True)
add('a14', '为什么用一个很宽的try/except包住interrupt后，人工审批暂停反而失效？', 'long_tail',
    [('lg-interrupts','If you wrap the @[`interrupt`] call in a try/except block, you will catch this exception and the interrupt will not be passed back to the graph.')],
    'interrupt用特殊异常暂停；不要吞掉该异常，可用具体异常类型限制捕获范围。',
    english='Why can wrapping interrupt in a broad try/except prevent human approval from pausing the graph?')
add('a15', '一个节点有多个人工提问，恢复前把提问顺序改掉会有问题吗？', 'long_tail',
    [('lg-interrupts','Matching is **strictly index-based**, so the order of interrupt calls within the node is important.')],
    '恢复值按位置匹配，需保持中断顺序一致。',
    english='Can I reorder multiple interrupt calls within a node before resuming it?')
add('a16', '直接调用graph.nodes中的节点做单测，也能验证检查点功能吗？', 'conditions',
    [('lg-test','Note that this will bypass any checkpointers passed when compiling the graph:')],
    '不能；直接节点测试绕过checkpointer，不能当作持久化集成测试。')
add('a17', '为什么每个有状态图的测试都建议重新创建checkpointer？', 'testing',
    [('lg-test','create your graph before each test where you use it, then compile it within tests with a new checkpointer instance.')],
    '原文给出独立实例模式；隔离测试状态是解释，应与原文事实区分。')
add('a18', '知识已经存在SQL数据库里，是不是做RAG就必须先重建成向量库？', 'conditions',
    [('lg-retrieval','you do **not** need to rebuild it.')],
    '不必；可封装为Agent工具或查询后给LLM上下文。',
    english='Must an existing SQL knowledge base be rebuilt as a vector database to use RAG?')
add('a19', '把JSON Schema字典直接传给Python create_agent的response_format会自动选择策略吗？', 'identifier',
    [('lg-structured','JSON Schema dictionaries must be wrapped in an explicit strategy (`ProviderStrategy` or `ToolStrategy`).')],
    '按此固定版本，字典须显式包装策略；区分schema类型与JSON Schema字典，不能混用JS规则。')
add('a20', 'ToolStrategy输出校验失败时，handle_errors=False与指定ValueError有什么区别？', 'long_tail',
    [('lg-structured','handle_errors=ValueError  # Only retry on ValueError, raise others'),
     ('lg-structured','handle_errors=False  # All errors raised')],
    'False让错误抛出；ValueError仅对匹配类型重试，其余抛出。',
    english='For ToolStrategy validation failures, how does handle_errors=False differ from handle_errors=ValueError?',review=True)
add('a21', '模型训练和把工具结果放回上下文，是同一件事吗？请结合两篇资料说明。', 'cross_document',
    [('hf-post-training','It involves training the model on a task-specific dataset with labeled examples.'),
     ('hf-observations','**Appends Results:** Integrates the new information into its existing context, effectively updating its memory.')],
    '区分SFT训练与运行时上下文更新；模型权重是否改变的推导须标为补充解释。')
add('a22', 'pi默认把所有工具串行执行吗？某个工具要求sequential时整个批次怎么办？', 'conditions',
    [('pi-agent','`parallel` (default)'),
     ('pi-agent','the entire batch executes sequentially regardless of the global setting.')],
    '按该提交默认parallel；任一工具executionMode为sequential会使整个批次串行。')

for ident, question, reading_ids in [
 ('n01','这些资料给出的RAG端到端P99延迟保证是多少毫秒？',['lg-retrieval']),
 ('n02','这个课程给出的DeepSeek训练完整模型的精确GPU数量和账单是多少？',['hf-rl']),
 ('n03','使用pi以后，我这个项目的开发效率必然提高百分之多少？',['pi-overview','pi-agent']),
]:
    cases.append(dict(id=ident,question=question,language='zh',category='unanswerable',origin='assistant-authored-before-run',
                      gold_status='provisional',answerable=False,evidence=[],reading_ids=reading_ids,human_review=True,
                      expected_behavior='所给资料没有这项数值或保证；不能编造。只读到片段时说明是当前证据不足，不能声称已检查全文。'))

user_cases = [
 ('u01','完整的RAG应该包括哪些部分',['lg-retrieval','hf-rag'],'检查是否区分基础流水线与生产要求；出处未涵盖的权限、评测等应标为补充解释。'),
 ('u02','怎么保证agent结构化输出',['lg-structured'],'检查是否区分格式/Schema约束与语义正确，说明能力条件、校验、失败处理，避免保证永不出错。'),
 ('u03','什么是模型后训练',['hf-post-training','hf-rl'],'资料覆盖SFT与RL的入门内容，不是后训练全景；检查是否承认边界，区分训练与RAG/提示词。'),
 ('u04','agent开发是否推荐从例如pi这样的开源架构起步',['pi-overview','pi-agent'],'pi暂按badlogic/pi-mono理解；检查是否结合用户学习目标给出有条件建议，不把README主张当作适用性证明。'),
]
for ident, question, reading_ids, behavior in user_cases:
    cases.append(dict(id=ident,question=question,language='zh',category='user_holdout',origin='user-verbatim',
                      gold_status='human_pending',answerable=None,evidence=[],reading_ids=reading_ids,human_review=True,
                      expected_behavior=behavior))

payload = dict(id='agent-learning-v1', source_manifest_sha256=hashlib.sha256((ROOT/'sources.json').read_bytes()).hexdigest(),
               protocol='Questions and span labels fixed before the first retrieval run; no retrieval tuning in this round. User questions are not a blind independent test because the curator has seen them.',
               cases=cases)
(ROOT/'cases.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Validated {len(cases)} questions, {sum(len(c["evidence"]) for c in cases)} exact evidence spans.')
