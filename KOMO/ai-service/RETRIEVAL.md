# 混合检索与文档版本

更新：2026-10-19。ES已退出运行代码与部署配置。本文描述实际实现，不代表检索质量或高可用已经验收。

## 职责

```text
Java：身份、文档归属、知识库范围、当前版本、数据库读写
  → Python：文档切块、中文/标识符词法分析、本地embedding、BM25、融合和上下文
      → Qdrant：不可变版本的片段、向量、原文位置与索引完成标记
```

PostgreSQL是文档事实源。浏览器不能指定任意检索用户；Java从认证上下文取得userId。Python的阅读和检索接口要求`X-Internal-Token`，且AI与Qdrant端口只绑定本机。内部密钥不是用户登录凭证，不能下发到前端。

## 检索策略

- 短文：正文不超过12000字符时直接提供全文，不强制召回截断。
- 长文阅读：按Markdown标题与1600字符上限切块，保存原文字符位置、行号和标题路径。选区优先；上下文为相关章节导言预留最多一半预算，再补召回和相邻片段。2026-10-22加入最多两轮只读补查，详见[阅读Agent](READING_CORE.md)。最终最多24片段、12000原文字符。
- 词法：Python使用jieba搜索模式处理中文，正则保留错误码、函数名等英文标识符；BM25按本次授权的当前版本语料计算词频、文档频率和平均长度。无需ES插件。
- 语义：默认`BAAI/bge-small-zh-v1.5`，FastEmbed/ONNX在本机CPU推理。每200字符形成编码窗口，向量均值池化后归一化，覆盖长块尾部，不只编码前512 tokens。池化仍可能稀释长块中的局部语义；它是需要比较的基线。
- 融合：两路各取前40，Python按RRF(k=60)融合、稳定排序。对问题中明确的代码式标识符，标题/章节精确命中优先，避免相似错误码被语义通道排到前面。保留各通道排名和融合分数供诊断。
- 普通聊天：在授权知识库内检索片段，Java再次核对当前权限、版本和原文切片后提供上下文，不再截取整篇文档开头2000字符。资料以user数据消息传入，不提升成system指令。

**当前Qdrant存储稠密向量和片段数据；BM25与融合在Python运行，没有声称已实现Qdrant稀疏向量索引。**这样可以精确使用本次范围的词频统计。代价是词法通道读取当前范围内片段，当前实现面向有界个人知识库，不能据此承诺大规模性能。

## 版本、补建与删除

版本键为`SHA256(title + NUL + content)`。集合名包含embedding模型和切块策略标识；模型更换使用新集合，不能混用不同向量空间。

1. Java读取当前用户、指定知识库的未删除文章，形成`id + revision`清单。
2. `/api/retrieval/missing`返回缺少完成标记的文章ID。Java只允许返回清单内的ID。
3. `/index`接收缺失文章。确定性point ID保证幂等；先写全部片段，再写完成标记。失败不能发布完整版本，重试跳过已成功写入的片段。
4. `/search`同时过滤userId和本轮版本清单；未完成版本拒绝检索。Java收到结果后再从数据库核对，剔除期间删除、编辑或移出范围的文章，拒绝伪造原文。
5. 设置页的索引维护补建当前版本，并通过`/prune`清理本用户的旧版本和删除文档片段；不会删除共享集合或其他用户数据。

这采用查询时补建，不是数据库与外部索引双写。文档保存成功不依赖Qdrant在线；缺失/故障会在检索时明确报错，不伪装成“没有资料”。长文首次问答可能更慢，建议批量导入后先维护索引。

删除后旧片段立即退出后续请求的授权清单，但物理清理需执行索引维护。并发编辑、索引维护不是跨服务原子事务；旧清单可能暂时清理一个较新版本，后续请求会补建或明确失败，不会用旧版本冒充新版本。当前没有持久化后台索引队列或分布式锁。

## 资源边界

- 单篇最多200万字符、4096块；普通聊天范围最多500篇、2000万字符、20000块。超限明确失败，不静默丢弃后面的文档。
- 单Python进程检索操作串行，锁等候最多2秒。索引每批16块，批次之间检查80秒预算；单次模型下载/推理或Qdrant调用可能使实际耗时超过这一软预算。
- 阅读运行总超时90秒、最多4个请求。取消不会强杀已经进入线程的ONNX推理；锁仍由该线程持有，后续请求会快速报告繁忙。
- 本地模型首次下载需要网络与磁盘空间，后续使用缓存。不调用远程embedding API，也不自动回退到纯词法检索。
- 没有训练式重排模型、严格的回答支持性判定或长文全局覆盖保证。只读Agent允许模型改写补查问题，但真实指代消解和补查质量尚未验证。

## 启动与迁移

1. 从`docker/.env.example`补充`AI_INTERNAL_TOKEN`，使用独立的至少32字节随机密钥；Java与Python必须使用同一值。不要打印或提交真实密钥。
2. `docker compose -f docker/docker-compose.yml build ai-service`，然后`docker compose -f docker/docker-compose.yml up -d qdrant ai-service`。Qdrant固定1.15.1；模型缓存保存在`embedding_cache`卷。
3. 预热模型：`docker exec komo-ai python -c "from app.retrieval.embedding import LocalEmbedding; LocalEmbedding().vectors(['初始化'])"`。
4. 重新编译启动Java与Web。Java不再需要任何ES环境变量。上一轮新增的`messages.reading_context`仍须按项目schema流程落地。
5. 登录设置页维护检索索引，再验证阅读和普通聊天。没有从ES迁移的需要，原文在PostgreSQL。
6. 新链路验证后可执行`docker stop komo-es`、`docker rm komo-es`清理旧容器。保留旧卷作为回退资料；不要执行`down -v`或全局清理。

本地直接运行Python时：安装`requirements.txt`，设置`QDRANT_URL=http://127.0.0.1:6333`、`AI_INTERNAL_TOKEN`与已有生成模型配置。`EMBEDDING_CACHE_DIR`可指定缓存目录，`EMBEDDING_THREADS`默认2。模型加载优先读取本地缓存；设置`EMBEDDING_ALLOW_DOWNLOAD=false`可禁止缓存缺失时下载，缺失会明确失败。生成模型密钥与embedding模型相互独立。

## 可重复验证

在`KOMO/ai-service`执行：

```bash
python -m unittest discover -s tests
python -m app.retrieval.evaluate --output hybrid-report.json
python -m app.retrieval.evaluate --url http://127.0.0.1:6333 --output hybrid-server-report.json
python -m app.retrieval.evaluate --cases evals/retrieval/legacy-corpus.json --url http://127.0.0.1:6333 --output hybrid-legacy-report.json
```

常规单测使用假embedding与真实Qdrant本地引擎验证行为，不下载模型。设置`QDRANT_TEST_URL=http://127.0.0.1:6333`后运行`test_retrieval.py`，会在服务器使用临时集合测试并清理。评测CLI使用真实本地embedding，首次会下载模型；使用合成语料，不调用生成模型。远程Qdrant评测同样只操作随机命名的临时集合。

2026-10-19实际结果：

- Python共43项测试通过；其中8项检索回归额外在真实Qdrant Server通过。
- Java常规112项测试通过，Web共60项测试和Next.js生产构建通过。
- `KnowledgeRetrievalGatewayIT`通过真实Java→Python→Qdrant HTTP链路与本地embedding验证首次索引、修改版本、查询和清理；只有数据库仓库使用测试替身。运行时设置`RETRIEVAL_IT_URL`为Python地址、`AI_INTERNAL_TOKEN`为同一内部密钥，在backend执行`mvn -Dtest=KnowledgeRetrievalGatewayIT test`。测试使用临时用户并清理其片段。
- 本地模型缓存模式在`EMBEDDING_ALLOW_DOWNLOAD=false`下成功生成512维向量。
- 8题诊断集中7题有目标依据，词法、稠密和混合检索各有6题在前三片段找到依据；“两人同时修改”口语改写三者均漏召回。加入代码标识符章节优先规则后，`ERR_NET_408`目标片段恢复首位。
- 从原Java检索评测迁移的32题合成集中28题有目标依据，词法26/28、稠密27/28、混合27/28命中前三片段；混合仍漏掉q15的“同主题笔记是否应丢弃”问题。无答案题只检查候选，不计入依据命中率。

这些题同时用于调试，不能当作独立测试集或线上准确率，也未验证生成答案的支持性。已停止并移除本机旧`komo-es`容器，保留其卷；Qdrant已实际启动。AI Docker镜像构建两次因Docker Hub鉴权端点连接超时失败，所以容器构建/部署尚未验收，以上真实链路使用本机Python进程。本轮未调用真实生成模型。

下一阶段应保留上述失败，加入真实文档和留出问题，比较更合适的中文/多语embedding、编码窗口与重排方案；不能把融合分数当作可回答概率，也不能用无答案问题检索到相近片段来证明回答正确。

### 真实Agent学习文档基线（2026-10-19）

已加入[17篇官方文档测评](evals/agent-learning/README.md)，固定提交、许可证和原文校验值，保留37道题及逐条检索/阅读上下文。30道暂定标注题的前五完整依据覆盖率为词法60.0%、稠密33.3%、混合50.0%。同一批8道问题的中/英文对照分别为词法4/8对7/8、稠密3/8对5/8、混合5/8对6/8；样本小，存在语言相关差异但不足以确定单一根因。指定阅读文档后的上下文完整覆盖为28/30，纯前缀为22/30；这两种评测范围不同，不能直接比较为同一种召回率。

这组结果揭示当前模型、切块/上下文选择、语言处理和融合仍需改进，没有用新题调参后覆盖原始失败。用户4道原话和3道无答案题不计自动通过率，生成答案与引用支持性需人工复核。完整结果及外部生成状态见[报告](evals/agent-learning/results/REPORT.md)。
