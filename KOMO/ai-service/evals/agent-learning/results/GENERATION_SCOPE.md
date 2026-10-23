# 真实回答生成发送范围

目的地：项目已配置的DeepSeek API，`https://api.deepseek.com/v1/chat/completions`。
范围：10道重点题（含用户原始4题）与它们的公开文档片段、阅读助理系统提示。没有账号资料、私人知识库、历史对话或密钥正文。API密钥仅用于正常请求认证。
最多10次生成任务，每次最多2048输出token，生产客户端最多重试一次。费用以服务商实际计量为准；这里没有价格估算。
实际messages保存在generation-requests.jsonl，清单创建时未发送；后续实际发送状态以answers.json为准。公开文档中的代码只作为文本，不执行。

| ID | 问题 | 原文来源 | 消息字符数 |
|---|---|---|---:|
| a05 | Code Agent可以生成可执行代码，是不是因此就能放心直接执行？ | hf-actions | 8719 |
| a13 | 为什么等我点批准后，批准之前的数据库写入又发生了一次？怎么避免重复副作用？ | lg-interrupts | 14951 |
| a20 | ToolStrategy输出校验失败时，handle_errors=False与指定ValueError有什么区别？ | lg-structured | 14750 |
| n01 | 这些资料给出的RAG端到端P99延迟保证是多少毫秒？ | lg-retrieval | 14213 |
| n02 | 这个课程给出的DeepSeek训练完整模型的精确GPU数量和账单是多少？ | hf-rl | 6710 |
| n03 | 使用pi以后，我这个项目的开发效率必然提高百分之多少？ | pi-overview, pi-agent | 15950 |
| u01 | 完整的RAG应该包括哪些部分 | lg-retrieval, hf-rag | 14410 |
| u02 | 怎么保证agent结构化输出 | lg-structured | 14270 |
| u03 | 什么是模型后训练 | hf-post-training, hf-rl | 10826 |
| u04 | agent开发是否推荐从例如pi这样的开源架构起步 | pi-overview, pi-agent | 16159 |

请求文件SHA256：`7f19f4c5b8681fd420c3042892af3c236a171457b9199c5a39db16b6c45ea9b6`。
