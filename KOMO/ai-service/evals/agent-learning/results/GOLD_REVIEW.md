# 暂定金标准与等价证据复核

优先复核a01-en、a13、a20-en：精确标注未覆盖不代表没有其他支持性证据。对每题写“真漏召回 / 有等价依据 / 标注不完整”，不要回写覆盖v1数据。

这是标注审核，不是回答评分；目前这些标签由助手提出。

## a01-en：Does sending a prompt to an LLM make an agent? How does this course define an agent?

标注的必要依据：

- [hf-agents 第50～50行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/what-are-agents.mdx#L50-L50)：An Agent is a system that leverages an AI model to interact with its environment in order to achieve a user-defined objective.

实际混合检索前五候选：

- [hf-tools 第294～321行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/tools.mdx#L294-L321)：What are Tools? / How do we give tools to an LLM? / Model Context Protocol (MCP): a unified tool interface
- [hf-tools 第12～38行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/tools.mdx#L12-L38)：What are Tools? / What are AI Tools?
- [hf-actions 第33～35行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/actions.mdx#L33-L35)：Actions:  Enabling the Agent to Engage with Its Environment / Types of Agent Actions
- [hf-cycle 第25～46行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/agent-steps-and-structure.mdx#L25-L46)：Understanding AI Agents through the Thought-Action-Observation Cycle / The Thought-Action-Observation Cycle
- [hf-agents 第144～160行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/what-are-agents.mdx#L144-L160)：What is an Agent? / What type of tasks can an Agent do? / Example 3: AI Non-Playable Character in a video game

你的判断：________；理由/补充依据：________

## a02：模型说要查天气时，到底是谁执行函数？执行结果怎么回到模型？

标注的必要依据：

- [hf-tools 第50～50行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/tools.mdx#L50-L50)：The **Agent** then reads this response, identifies that a tool call is required, executes the tool on the LLM’s behalf, and retrieves the actual weather data.
- [hf-tools 第52～52行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/tools.mdx#L52-L52)：the Agent appends them as a new message before passing the updated conversation to the LLM again.

实际混合检索前五候选：

- [hf-agents 第80～88行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/what-are-agents.mdx#L80-L88)：What is an Agent? / What type of AI Models do we use for Agents?
- [lg-structured 第1064～1114行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1064-L1114)：Tool calling strategy / Error handling / Error handling strategies
- [hf-actions 第91～128行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/actions.mdx#L91-L128)：Actions:  Enabling the Agent to Engage with Its Environment / Code Agents
- [hf-graph 第26～55行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit2/langgraph/building_blocks.mdx#L26-L55)：Building Blocks of LangGraph / 2. Nodes
- [hf-document 第55～105行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit2/langgraph/document_analysis_agent.mdx#L55-L105)：Document Analysis Graph / Preparing Tools

你的判断：________；理由/补充依据：________

## a03：给Agent提供一个工具，最少需要描述哪些内容？返回值类型是否必填？

标注的必要依据：

- [hf-tools 第39～39行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/tools.mdx#L39-L39)：A **textual description of what the function does**.
- [hf-tools 第42～42行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/tools.mdx#L42-L42)：(Optional) Outputs with typings.

实际混合检索前五候选：

- [pi-agent 第424～450行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L424-L450)：@earendil-works/pi-agent-core / Custom Message Types
- [lg-structured 第81～112行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L81-L112)：Response format
- [lg-interrupts 第1270～1337行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L1270-L1337)：Rules of interrupts / Do not return complex values in `interrupt` calls
- [hf-agents 第42～45行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/what-are-agents.mdx#L42-L45)：What is an Agent? / The Big Picture: Alfred The Agent
- [hf-actions 第14～32行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/actions.mdx#L14-L32)：Actions:  Enabling the Agent to Engage with Its Environment / Types of Agent Actions

你的判断：________；理由/补充依据：________

## a04：模型输出完一次动作后为什么要停下来，不能接着自己编后续结果吗？

标注的必要依据：

- [hf-actions 第33～33行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/actions.mdx#L33-L33)：This passes control from the LLM back to the agent and ensures the result is parseable
- [hf-actions 第50～50行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/actions.mdx#L50-L50)：An external parser reads the formatted action, determines which Tool to call, and extracts the required parameters.

实际混合检索前五候选：

- [pi-agent 第148～168行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L148-L168)：@earendil-works/pi-agent-core / Event Flow / Request preparation and turn finalization
- [pi-agent 第124～147行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L124-L147)：@earendil-works/pi-agent-core / Event Flow / Request preparation and turn finalization
- [lg-structured 第1171～1227行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1171-L1227)：Tool calling strategy / Error handling / Error handling strategies
- [pi-agent 第248～279行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L248-L279)：@earendil-works/pi-agent-core / Agent Options
- [pi-agent 第488～505行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L488-L505)：@earendil-works/pi-agent-core / Tools / Error Handling

你的判断：________；理由/补充依据：________

## a06：工具出错或返回数据以后，Agent下一轮怎么利用这些反馈？

标注的必要依据：

- [hf-observations 第12～12行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/observations.mdx#L12-L12)：**Appends Results:** Integrates the new information into its existing context, effectively updating its memory.
- [hf-observations 第13～13行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/observations.mdx#L13-L13)：**Adapts its Strategy:** Uses this updated context to refine subsequent thoughts and actions.

实际混合检索前五候选：

- [pi-agent 第11～40行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L11-L40)：@earendil-works/pi-agent-core / Quick Start
- [lg-interrupts 第872～907行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L872-L907)：Common patterns / Interrupts in tools
- [lg-interrupts 第771～817行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L771-L817)：Common patterns / Interrupts in tools
- [pi-agent 第202～247行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L202-L247)：@earendil-works/pi-agent-core / Agent Options
- [lg-interrupts 第391～442行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L391-L442)：Common patterns / Approve or reject

你的判断：________；理由/补充依据：________

## a07：LangGraph里的State、节点和条件边各负责什么？

标注的必要依据：

- [hf-graph 第13～13行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit2/langgraph/building_blocks.mdx#L13-L13)：It represents all the information that flows through your application.
- [hf-graph 第29～29行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit2/langgraph/building_blocks.mdx#L29-L29)：Takes the state as input
- [hf-graph 第81～81行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit2/langgraph/building_blocks.mdx#L81-L81)：**Conditional**: Choose the next node based on the current state

实际混合检索前五候选：

- [hf-graph 第26～55行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit2/langgraph/building_blocks.mdx#L26-L55)：Building Blocks of LangGraph / 2. Nodes
- [lg-interrupts 第936～983行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L936-L983)：Common patterns / Validating human input
- [lg-test 第240～292行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/test.mdx#L240-L292)：Partial execution
- [lg-persistence 第122～125行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/persistence.mdx#L122-L125)：Next steps
- [lg-interrupts 第443～502行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L443-L502)：Common patterns / Approve or reject

你的判断：________；理由/补充依据：________

## a09：Agentic RAG相对每次都先检索再回答，多了什么决定权？

标注的必要依据：

- [hf-rag 第22～22行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit3/agentic-rag/agentic-rag.mdx#L22-L22)：Alfred can decide to use any other tool or flow to answer the question.

实际混合检索前五候选：

- [lg-retrieval 第130～143行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx#L130-L143)：RAG architectures
- [lg-retrieval 第427～455行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx#L427-L455)：RAG architectures / Hybrid RAG
- [lg-retrieval 第1～11行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx#L1-L11)：正文
- [hf-rag 第28～28行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit3/agentic-rag/agentic-rag.mdx#L28-L28)：Agentic Retrieval Augmented Generation (RAG)
- [pi-agent 第248～279行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L248-L279)：@earendil-works/pi-agent-core / Agent Options

你的判断：________；理由/补充依据：________

## a11：进程重启以后，为什么MemorySaver里的聊天状态没了？该换什么？

标注的必要依据：

- [lg-persistence 第93～93行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/persistence.mdx#L93-L93)：`MemorySaver` and `InMemorySaver` store checkpoints in RAM. When the process restarts, all checkpoints are lost.

实际混合检索前五候选：

- [lg-test 第240～292行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/test.mdx#L240-L292)：Partial execution
- [lg-interrupts 第984～1005行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L984-L1005)：Common patterns / Validating human input
- [lg-persistence 第23～64行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/persistence.mdx#L23-L64)：Quickstart
- [lg-interrupts 第872～907行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L872-L907)：Common patterns / Interrupts in tools
- [lg-test 第200～239行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/test.mdx#L200-L239)：Partial execution

你的判断：________；理由/补充依据：________

## a12：人工批准后恢复运行，thread_id换一个新的可以吗？

标注的必要依据：

- [lg-interrupts 第100～100行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L100-L100)：You must use the **same thread ID** when resuming that was used when the interrupt occurred

实际混合检索前五候选：

- [lg-persistence 第78～90行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/persistence.mdx#L78-L90)：Troubleshooting common issues / PostgresSaver: `thread_id` too long
- [lg-interrupts 第29～35行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L29-L35)：正文
- [lg-persistence 第23～64行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/persistence.mdx#L23-L64)：Quickstart
- [lg-test 第240～292行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/test.mdx#L240-L292)：Partial execution
- [lg-interrupts 第771～817行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L771-L817)：Common patterns / Interrupts in tools

你的判断：________；理由/补充依据：________

## a13：为什么等我点批准后，批准之前的数据库写入又发生了一次？怎么避免重复副作用？

标注的必要依据：

- [lg-interrupts 第1354～1354行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L1354-L1354)：side effects called before @[`interrupt`] should (ideally) be idempotent.
- [lg-interrupts 第1359～1359行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L1359-L1359)：Place side effects after @[`interrupt`] calls

实际混合检索前五候选：

- [lg-persistence 第100～115行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/persistence.mdx#L100-L115)：Troubleshooting common issues / Checkpoints growing unboundedly
- [lg-interrupts 第1452～1511行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L1452-L1511)：Rules of interrupts / Side effects called before `interrupt` must be idempotent
- [lg-interrupts 第1338～1351行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L1338-L1351)：Rules of interrupts / Do not return complex values in `interrupt` calls
- [lg-interrupts 第391～442行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L391-L442)：Common patterns / Approve or reject
- [lg-interrupts 第587～632行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L587-L632)：Common patterns / Review and edit state

你的判断：________；理由/补充依据：________

## a15：一个节点有多个人工提问，恢复前把提问顺序改掉会有问题吗？

标注的必要依据：

- [lg-interrupts 第1118～1118行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L1118-L1118)：Matching is **strictly index-based**, so the order of interrupt calls within the node is important.

实际混合检索前五候选：

- [pi-agent 第148～168行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L148-L168)：@earendil-works/pi-agent-core / Event Flow / Request preparation and turn finalization
- [lg-interrupts 第908～935行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L908-L935)：Common patterns / Validating human input
- [pi-agent 第385～423行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L385-L423)：@earendil-works/pi-agent-core / Steering and Follow-up
- [pi-agent 第169～184行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L169-L184)：@earendil-works/pi-agent-core / Event Flow / continue() and queued input
- [lg-interrupts 第936～983行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx#L936-L983)：Common patterns / Validating human input

你的判断：________；理由/补充依据：________

## a19：把JSON Schema字典直接传给Python create_agent的response_format会自动选择策略吗？

标注的必要依据：

- [lg-structured 第42～42行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L42-L42)：JSON Schema dictionaries must be wrapped in an explicit strategy (`ProviderStrategy` or `ToolStrategy`).

实际混合检索前五候选：

- [lg-structured 第1～26行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1-L26)：正文
- [lg-structured 第404～441行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L404-L441)：Tool calling strategy
- [lg-structured 第57～80行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L57-L80)：Response format
- [lg-structured 第150～198行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L150-L198)：Provider strategy
- [lg-structured 第567～615行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L567-L615)：Tool calling strategy / Custom tool message content

你的判断：________；理由/补充依据：________

## a20-en：For ToolStrategy validation failures, how does handle_errors=False differ from handle_errors=ValueError?

标注的必要依据：

- [lg-structured 第1040～1040行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1040-L1040)：handle_errors=ValueError  # Only retry on ValueError, raise others
- [lg-structured 第1126～1126行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1126-L1126)：handle_errors=False  # All errors raised

实际混合检索前五候选：

- [lg-structured 第1016～1063行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1016-L1063)：Tool calling strategy / Error handling / Error handling strategies
- [lg-structured 第1171～1227行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1171-L1227)：Tool calling strategy / Error handling / Error handling strategies
- [lg-structured 第1064～1114行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L1064-L1114)：Tool calling strategy / Error handling / Error handling strategies
- [lg-structured 第366～403行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L366-L403)：Tool calling strategy
- [lg-structured 第959～1006行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx#L959-L1006)：Tool calling strategy / Error handling / Schema validation error

你的判断：________；理由/补充依据：________

## a21：模型训练和把工具结果放回上下文，是同一件事吗？请结合两篇资料说明。

标注的必要依据：

- [hf-post-training 第11～11行](https://github.com/huggingface/course/blob/8b893f0ede6c781045692a7f892f25a0c92b4805/chapters/en/chapter11/1.mdx#L11-L11)：It involves training the model on a task-specific dataset with labeled examples.
- [hf-observations 第12～12行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/observations.mdx#L12-L12)：**Appends Results:** Integrates the new information into its existing context, effectively updating its memory.

实际混合检索前五候选：

- [hf-post-training 第24～32行](https://github.com/huggingface/course/blob/8b893f0ede6c781045692a7f892f25a0c92b4805/chapters/en/chapter11/1.mdx#L24-L32)：Supervised Fine-Tuning / References
- [hf-agents 第89～104行](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/what-are-agents.mdx#L89-L104)：What is an Agent? / How does an AI take action on its environment?
- [hf-rl 第66～70行](https://github.com/huggingface/course/blob/8b893f0ede6c781045692a7f892f25a0c92b4805/chapters/en/chapter12/1.mdx#L66-L70)：Open R1 for Students / Chapter Overview / 4️⃣ Practical use case to align a model
- [lg-retrieval 第144～183行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx#L144-L183)：RAG architectures / 2-step RAG
- [lg-retrieval 第76～129行](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx#L76-L129)：Building a knowledge base / Building blocks

你的判断：________；理由/补充依据：________

## a22：pi默认把所有工具串行执行吗？某个工具要求sequential时整个批次怎么办？

标注的必要依据：

- [pi-agent 第111～111行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L111-L111)：`parallel` (default)
- [pi-agent 第116～116行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L116-L116)：the entire batch executes sequentially regardless of the global setting.

实际混合检索前五候选：

- [pi-overview 第23～55行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/README.md#L23-L55)：Pi / Getting started
- [pi-agent 第451～487行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L451-L487)：@earendil-works/pi-agent-core / Tools
- [pi-overview 第56～71行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/README.md#L56-L71)：Pi / Run with Nix
- [pi-agent 第202～247行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md#L202-L247)：@earendil-works/pi-agent-core / Agent Options
- [pi-overview 第72～87行](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/README.md#L72-L87)：Pi / Packages

你的判断：________；理由/补充依据：________

