# Agent开发学习：真实文档评测

这是一套检索与文档阅读测评资产，不是对框架本身的评测，也没有实现新的Agent框架。2026-10-19固定官方原文版本；本轮只增加语料、评测器和验证记录，没有根据这套题调整检索生产代码。

先读[基线结果](results/REPORT.md)，人工评分看[复核工作单](results/HUMAN_REVIEW.md)和[CSV](results/human-review.csv)，等价证据审核见[金标准复核](results/GOLD_REVIEW.md)。外部生成范围见[发送清单](results/GENERATION_SCOPE.md)。

## 资料来源与学习顺序

1. [Hugging Face Agent课程](https://huggingface.co/learn/agents-course/en/unit1/what-are-agents)：Agent定义、工具、动作、观察、图结构和Agentic RAG。先读`hf-agents`、`hf-tools`、`hf-actions`、`hf-observations`，再读图示例。
2. [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)、[Test](https://docs.langchain.com/oss/python/langgraph/test)：状态保存、人工介入、恢复副作用和测试边界。
3. [LangChain Retrieval](https://docs.langchain.com/oss/python/deepagents/retrieval)、[Structured output](https://docs.langchain.com/oss/python/langchain/structured-output)：检索到生成的流程与输出约束。注意文中的“Hybrid RAG”指架构组合，不能直接等同于本项目的“BM25+向量混合检索”。
4. [Hugging Face SFT课程](https://huggingface.co/learn/llm-course/en/chapter11/1)与[RL入门](https://huggingface.co/learn/llm-course/en/chapter12/1)：提供后训练的部分入门材料，并非完整后训练综述。
5. [Pi官方仓库](https://github.com/badlogic/pi-mono)及Agent核心README：用于讨论现成运行时的接口与取舍。保存版本的包名/组织可能不同于你见过的旧教程，以快照为准；它不是框架优劣的独立证据。

17篇原文位于`sources/`，约23万字符。`sources.json`记录每篇公开阅读地址、精确提交、源文件路径、SHA256、许可证。`licenses/`保留Hugging Face的Apache-2.0和LangChain/Pi的MIT许可。资料来自维护方的一手文档，仍可能有错误、过时说明或教程简化；“官方”不是无条件真理。

原始MDX字节以`.md`扩展名保存，没有翻译、摘要或按问题裁剪。保留图片链接与Python/JS并列段落，不下载图片、不展开外链示例、不执行文中命令。需要阅读排版时打开官网；精确证据以固定提交原文件为准。Git属性禁用这些快照和清单的自动换行转换，保证校验可复现。

## 题目与指标

- 22道中文标注题，覆盖口语改写、标识符、条件限制、跨文档及长文尾部。
- 其中8题配有英文对照，用于诊断中文问英文资料的差异；它们不是8个独立学习需求。
- 3道当前资料不提供答案的题，测试是否编造数值或保证。
- 4道用户原话：完整RAG、结构化输出、后训练、是否从pi起步。金标准待人工确认，不纳入自动成功率。

标注题的全部参考引文都校验为原文精确切片，含字符位置和行号。标注只是助手提出的候选金标准；不能遗漏其他等价证据后把它们武断记为错误。因此保留完整候选和上下文供复核。人工改标应产生新版本，保留v1结果。

检索分别运行词法、稠密、混合通道，统计依据召回@3/@5、全部依据覆盖@3/@5与MRR@5；多条依据不能因为只找到一条就算完整成功。无答案题没有“召回为零即答对”的评分，必须看最终回答。阅读评测调用真实生产`prepare_hybrid`，检查实际12000字符上下文是否覆盖依据，并与只取前12000字符作比较。

本轮无关的边界：未测浏览器引用跳转、Java HTTP全链路、并发吞吐、线上数据、中文文档总体质量、真正多步工具决策或长期记忆。旧回归通过不意味着这些新问题已解决。

本轮验证：Python全套50项通过，覆盖原文校验、跨文档/多依据计分、Windows报告写入重试、生成请求哈希、单题选择边界及提供方非正常结束原因。真实Qdrant基线37题完成，临时集合清理成功。用户明确授权后，真实`deepseek-v4-flash`首轮生成9/10题；u04在原始输入和参数下重试一次后完成。现在10题都有完整回答，首轮失败未覆盖；原始回答见[ANSWERS.md](results/ANSWERS.md)，初步问题见[助手复核](results/PRELIMINARY_REVIEW.md)。引用编号检查不等于支持性评分。

## 复现

在`KOMO/ai-service`目录，安装项目依赖。先检查固定语料：

```bash
python evals/agent-learning/fetch_sources.py
python -m unittest discover -s tests -p test_learning_evaluation.py
```

缺少快照时用`fetch_sources.py --fetch`从记录的精确提交恢复，只允许下载匹配SHA256的原文。已有文件内容不符会报错，不覆盖用户修改。

设置`EMBEDDING_CACHE_DIR`为模型缓存；本次运行设置了`EMBEDDING_ALLOW_DOWNLOAD=false`。默认评测不需要生成API密钥：

```bash
python -m app.retrieval.evaluate_learning --url http://127.0.0.1:6333 --output evals/agent-learning/results/baseline.json
python evals/agent-learning/render_report.py
```

不传`--url`则使用Qdrant本地内存引擎；不能把两种环境的耗时混称为服务器表现。评测创建随机临时集合，结束后清理；报告记录清理状态。全套串行查询仅用于质量诊断。

`build_cases.py`是标注生成记录，正常复现不运行它。改变语料、题目或金标准后，应另存新版本并说明改动，不用重建来掩盖原文校验失败。

## 真实回答与人工评测

10道重点题中包含用户4题、3道无答案题、3道风险/长文题。`generation-requests.jsonl`保存生产阅读策略已经选好的消息与证据，默认未发送。真实生成应在明确批准目的地与数据范围后执行，设置现有`DEEPSEEK_API_KEY`及可选`DEEPSEEK_MODEL`环境变量；不要写入源代码或报告。

```bash
python -m app.retrieval.generate_learning \
  --requests evals/agent-learning/results/generation-requests.jsonl \
  --expected-sha256 <GENERATION_SCOPE.md中的SHA256> \
  --output evals/agent-learning/results/answers.json
```

这会调用现有生产provider和ReadingRuntime，复用已固定消息，不重新检索。它没有模拟浏览器/Java层。每题最多2048输出token；实际账单和token用量不能从当前流接口精确统计。引用ID存在性可以自动检查，引用是否支持结论及是否真正帮助理解必须由人评分。

如授权范围内需要单题重试，使用`--case-id u04`并另选输出文件，仍校验整个已批准请求文件的SHA256。不要覆盖首轮答案。本轮结果视图读取`answers.json`及`answers-retry-u04.json`，人工CSV已有分数不会被刷新脚本覆盖。

评测方法参考[OpenAI官方Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)与[Agent evals](https://developers.openai.com/api/docs/guides/agent-evals)：保存可复查输入/过程，将组件指标与端到端行为分开。它们仅作方法参考，没有复制全文进入语料。
