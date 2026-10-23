# Agent学习真实文档测评基线

运行时间：2026-10-19T09:32:26.716481+00:00。模型：`BAAI/bge-small-zh-v1.5`。

17篇官方文档，230,747字符，240片段，37题。

问题、证据位置和文档版本在检索前固定。本轮没有调整生产检索、embedding、切块或融合规则。

## 检索结果

前三/前五完整覆盖率要求找全该题标注的全部依据。证据召回率按题宏平均；MRR@5只表示第一条标注依据出现的位置。标注为暂定人工复核，不能称为真实用户准确率。

| 语言组 | 通道 | 计分题数 | 依据召回@3 | 全部依据@3 | 全部依据@5 | MRR@5 |
|---|---|---:|---:|---:|---:|---:|
| all | lexical | 30 | 53.3% | 53.3% | 60.0% | 0.515 |
| all | dense | 30 | 33.3% | 30.0% | 33.3% | 0.286 |
| all | hybrid | 30 | 51.1% | 46.7% | 50.0% | 0.489 |
| language:zh | lexical | 22 | 40.9% | 40.9% | 50.0% | 0.407 |
| language:zh | dense | 22 | 20.5% | 18.2% | 22.7% | 0.163 |
| language:zh | hybrid | 22 | 40.2% | 36.4% | 40.9% | 0.371 |
| language:en | lexical | 8 | 87.5% | 87.5% | 87.5% | 0.812 |
| language:en | dense | 8 | 68.8% | 62.5% | 62.5% | 0.625 |
| language:en | hybrid | 8 | 81.2% | 75.0% | 75.0% | 0.812 |

中文22题与英文8题题目构成不同，不能仅比较组均值归因。下面只比较同一批8道成对问题的前五完整依据覆盖：

| 通道 | 中文原问 | 英文对照 |
|---|---:|---:|
| lexical | 4/8 | 7/8 |
| dense | 3/8 | 5/8 |
| hybrid | 5/8 | 6/8 |

样本较小，观察到语言相关差异，不能据此确定单一根因或统计显著性。下一版应分别比较多语embedding、文档语言分离与重排，保留本轮原始基线。

## 阅读上下文

调用生产`prepare_hybrid`后，28/30题的最终上下文包含全部标注依据；仅截取前12000字符时为22/30。这仍是上下文覆盖，不是答案正确率。

知识库检索和阅读上下文分别测量：前者在17篇中检索，后者已经指定阅读文档；合并阅读包也明确给定来源。不能将二者直接当作同范围的策略胜负。

## 混合检索前五未覆盖全部标注依据的题

| ID | 问题 | 标注来源 |
|---|---|---|
| a01-en | Does sending a prompt to an LLM make an agent? How does this course define an agent? | hf-agents |
| a02 | 模型说要查天气时，到底是谁执行函数？执行结果怎么回到模型？ | hf-tools |
| a03 | 给Agent提供一个工具，最少需要描述哪些内容？返回值类型是否必填？ | hf-tools |
| a04 | 模型输出完一次动作后为什么要停下来，不能接着自己编后续结果吗？ | hf-actions |
| a06 | 工具出错或返回数据以后，Agent下一轮怎么利用这些反馈？ | hf-observations |
| a07 | LangGraph里的State、节点和条件边各负责什么？ | hf-graph |
| a09 | Agentic RAG相对每次都先检索再回答，多了什么决定权？ | hf-rag |
| a11 | 进程重启以后，为什么MemorySaver里的聊天状态没了？该换什么？ | lg-persistence |
| a12 | 人工批准后恢复运行，thread_id换一个新的可以吗？ | lg-interrupts |
| a13 | 为什么等我点批准后，批准之前的数据库写入又发生了一次？怎么避免重复副作用？ | lg-interrupts |
| a15 | 一个节点有多个人工提问，恢复前把提问顺序改掉会有问题吗？ | lg-interrupts |
| a19 | 把JSON Schema字典直接传给Python create_agent的response_format会自动选择策略吗？ | lg-structured |
| a20-en | For ToolStrategy validation failures, how does handle_errors=False differ from handle_errors=ValueError? | lg-structured |
| a21 | 模型训练和把工具结果放回上下文，是同一件事吗？请结合两篇资料说明。 | hf-observations, hf-post-training |
| a22 | pi默认把所有工具串行执行吗？某个工具要求sequential时整个批次怎么办？ | pi-agent |

缺失某条精确标注不一定表示没有等价依据。请在HUMAN_REVIEW.md中复核候选，尤其是同一事实在多篇文档或Python/JS段落重复出现的情况。

## 你的4道原始问题

| ID | 原话 | 混合检索前三候选 |
|---|---|---|
| u01 | 完整的RAG应该包括哪些部分 | lg-retrieval:144, lg-retrieval:130, lg-retrieval:456 |
| u02 | 怎么保证agent结构化输出 | hf-actions:1, lg-structured:57, lg-test:187 |
| u03 | 什么是模型后训练 | hf-post-training:9, hf-rl:66, hf-post-training:13 |
| u04 | agent开发是否推荐从例如pi这样的开源架构起步 | pi-overview:13, pi-overview:56, pi-overview:72 |

用户题没有擅自补金标准，暂不计入自动成功率。3道无答案题同样不计入召回率，返回相似片段不等于应该回答。

## 验证边界

- 真实Qdrant Server与缓存本地embedding；唯一临时集合已清理：True。
- 英文原文含MDX、Python/JS并列内容，未展开图片或外链代码；这些是实际文档输入限制。
- 相同中文问题的英文对照不是独立样本；语料由维护者挑选，题目主要由助手编写，必须人工复核。
- 请求串行运行，模型已缓存；耗时记录不是负载或高可用测试。
- 真实生成已完成10/10题。u04按原始输入及参数重试一次，首轮与重试记录分别保留。答案仍需人工评分，引用ID合法不代表结论有依据。
- 首轮因Windows结果文件被暂时占用中断，保留interrupted.json；只修复评测结果写入重试后重跑，没有调检索。

原始日志：[baseline.json](baseline.json)。文档校验与案例标签见上级sources.json、cases.json。
