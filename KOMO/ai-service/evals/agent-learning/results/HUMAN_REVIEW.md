# 人工复核工作单

先看问题和证据，再检查回答。优先做u01～u04，再完成全部10道重点题。真实生成已完成10/10题。u04按原始输入及参数重试一次，首轮与重试记录分别保留。答案仍需人工评分，引用ID合法不代表结论有依据。

## 评分规则

在human-review.csv填写评分，留空表示未评，不等于0。

- correctness：0=核心错误；1=部分正确但缺关键条件；2=正确且条件完整。
- citation_support：0=引用不支持结论或伪造；1=部分结论没有依据；2=关键文档结论均被对应原文支持。补充解释必须明确标出。
- uncertainty：0=编造缺失数值或绝对保证；1=边界模糊；2=清楚说明当前资料/片段的限制。
- learning_value：0=仍不明白；1=能复述但不能应用；2=能用自己的例子解释并做出下一步。
- critical_error：yes/no；例如把上下文更新说成训练、声称副作用绝不重复、声称结构化输出保证内容真实。出现关键错误则不能整体判通过。
- retrieval_relevance：按前三候选逐条写0/1/2（无关/有帮助但不足/直接支持问题）；没有固定正确答案的推荐题尤其需要此项。

## 额外需要你做的产品检查

1. 在测试知识库中导入选定原文，确认引用点击后看到的段落与回答一致；脚本没有替代浏览器交互验收。
2. 对回答追问“为什么”“换一个例子呢”，检查条件是否丢失；本轮自动基线主要是单轮。
3. 读后自行写3～5句理解或修改自己的笔记，判断是否更容易组织知识。不要仅按回答是否流畅打分。
4. 对精确标注漏召回的题，检查其他候选是否包含等价证据。记录标注修订，不覆盖本轮冻结基线。

## 重点题及证据

### a05：Code Agent可以生成可执行代码，是不是因此就能放心直接执行？

需要判断：不能保证安全；原文提示代码执行风险和框架防护，不应夸大为绝对安全。

阅读来源：[Actions:  Enabling the Agent to Engage with Its Environment](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit1/actions.mdx)

模型回答（未人工评分）：

不能。原文恰恰在介绍 Code Agent 优点之后，紧接着给出安全警告。

**文档的立场**

- Code Agent 的特点是生成“可执行代码块”，通常用 Python 这类高级语言 [S5]。
- 但原文明确提醒：“**executing LLM-generated code may pose security risks, from prompt injection to the execution of harmful code**”，也就是执行 LLM 生成的代码可能带来安全风险，从提示注入到执行有害代码 [S5]。
- 因此原文的建议不是“直接执行”，而是使用集成**默认防护措施**的 AI agent 框架，例如 `smolagents`；如需了解风险与缓解方式，原文指向专门章节 [S5]。

**关键区别**

“能生成可执行代码”是能力描述；“可以放心直接执行”是安全结论。文档支持前者，但不支持后者——可执行性正是风险的来源，而不是安全的保证。

**文档提到的 Code Agent 优点，不等于安全性**

原文列出的优点是表达力强（循环、条件、嵌套函数）、模块化与可复用、更易调试、可直接集成外部库和 API [S5]。这些说明它适合复杂任务，但没有一条说明生成代码可以不经防护就运行。

**需要注意的边界**

本轮文档只给出了风险提示、推荐框架和外部链接，并未具体展开沙箱、权限限制、人工审核等缓解措施的细节 [S5]。若要设计实际防护方案，需查阅原文所链接的专门章节，不能仅凭本节内容推断。

补充解释（非作者观点）：通常的做法包括在隔离环境中执行、限制网络与文件系统权限、限定可用工具与 API、对生成代码做静态检查或人工确认；这些属于通用工程实践，本文未展开。

自动引用ID检查：`{"cited_ids": ["S5"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Actions:  Enabling the Agent to Engage with Its Environment，阅读包第1～13行**

> # Actions:  Enabling the Agent to Engage with Its Environment
> 
> > [!TIP]
> > In this section, we explore the concrete steps an AI agent takes to interact with its environment. 
> >
> >  We’ll cover how actions are represented (using JSON or code), the importance of the stop and parse approach, and introduce different types of agents.
> 
> Actions are the concrete steps an **AI agent takes to interact with its environment**. 
> 
> Whether it’s browsing the web for information or controlling a physical device, each action is a deliberate operation executed by the agent. 
> 
> For example, an agent assisting with customer service might retrieve customer data, offer support articles, or transfer issues to a human representative.
> 
> 

**[S2] Actions:  Enabling the Agent to Engage with Its Environment / Types of Agent Actions，阅读包第14～32行**

> ## Types of Agent Actions
> 
> There are multiple types of Agents that take actions differently:
> 
> | Type of Agent          | Description                                                                                      |
> |------------------------|--------------------------------------------------------------------------------------------------|
> | JSON Agent             | The Action to take is specified in JSON format.                                                  |
> | Code Agent             | The Agent writes a code block that is interpreted externally.                                    |
> | Function-calling Agent | It is a subcategory of the JSON Agent which has been fine-tuned to generate a new message for each action. |
> 
> Actions themselves can serve many purposes:
> 
> | Type of Action           | Description                                                                              |
> |--------------------------|------------------------------------------------------------------------------------------|
> | Information Gathering    | Performing web searches, querying databases, or retrieving documents.                    |
> | Tool Usage               | Making API calls, running calculations, and executing code.                              |
> | Environment Interaction  | Manipulating digital interfaces or controlling physical devices.                         |
> | Communication            | Engaging with users via chat or collaborating with other agents.                         |
> 
> 

**[S3] Actions:  Enabling the Agent to Engage with Its Environment / Types of Agent Actions，阅读包第33～35行**

> The LLM only handles text and uses it to describe the action it wants to take and the parameters to supply to the tool. For an agent to work properly, the LLM must STOP generating new tokens after emitting all the tokens to define a complete Action. This passes control from the LLM back to the agent and ensures the result is parseable - whether the intended format is JSON, code, or function-calling. 
> 
> 
> 

**[S4] Actions:  Enabling the Agent to Engage with Its Environment / The Stop and Parse Approach，阅读包第36～69行**

> ## The Stop and Parse Approach
> 
> One key method for implementing actions is the **stop and parse approach**. This method ensures that the agent’s output is structured and predictable:
> 
> 1. **Generation in a Structured Format**:
> 
> The agent outputs its intended action in a clear, predetermined format (JSON or code).
> 
> 2. **Halting Further Generation**:
> 
> Once the text defining the action has been emitted, **the LLM stops generating additional tokens**. This prevents extra or erroneous output.
> 
> 3. **Parsing the Output**:
> 
> An external parser reads the formatted action, determines which Tool to call, and extracts the required parameters.
> 
> For example, an agent needing to check the weather might output:
> 
> 
> ```json
> Thought: I need to check the current weather for New York.
> Action :
> {
>   "action": "get_weather",
>   "action_input": {"location": "New York"}
> }
> ```
> The framework can then easily parse the name of the function to call and the arguments to apply.
> 
> This clear, machine-readable format minimizes errors and enables external tools to accurately process the agent’s command.
> 
> Note: Function-calling agents operate similarly by structuring each action so that a designated function is invoked with the correct arguments.
> We'll dive deeper into those types of Agents in a future Unit.
> 
> 

**[S5] Actions:  Enabling the Agent to Engage with Its Environment / Code Agents，阅读包第70～90行**

> ## Code Agents
> 
> An alternative approach is using *Code Agents*.
> The idea is: **instead of outputting a simple JSON object**, a Code Agent generates an **executable code block—typically in a high-level language like Python**. 
> 
> <img src="https://huggingface.co/datasets/agents-course/course-images/resolve/main/en/unit1/code-vs-json-actions.png" alt="Code Agents" />
> 
> This approach offers several advantages:
> 
> - **Expressiveness:** Code can naturally represent complex logic, including loops, conditionals, and nested functions, providing greater flexibility than JSON.
> - **Modularity and Reusability:** Generated code can include functions and modules that are reusable across different actions or tasks.
> - **Enhanced Debuggability:** With a well-defined programming syntax, code errors are often easier to detect and correct.
> - **Direct Integration:** Code Agents can integrate directly with external libraries and APIs, enabling more complex operations such as data processing or real-time decision making.
> 
> You must keep in mind that executing LLM-generated code may pose security risks, from prompt injection to the execution of harmful code.
> That's why it's recommended to use AI agent frameworks like `smolagents` that integrate default safeguards.
> If you want to know more about the risks and how to mitigate them, [please have a look at this dedicated section](https://huggingface.co/docs/smolagents/tutorials/secure_code_execution).
> 
> For example, a Code Agent tasked with fetching the weather might generate the following Python snippet:
> 
> ```python
> 

**[S6] Actions:  Enabling the Agent to Engage with Its Environment / Code Agents，阅读包第91～128行**

> # Code Agent Example: Retrieve Weather Information
> def get_weather(city):
>     import requests
>     api_url = f"https://api.weather.com/v1/location/{city}?apiKey=YOUR_API_KEY"
>     response = requests.get(api_url)
>     if response.status_code == 200:
>         data = response.json()
>         return data.get("weather", "No weather information available")
>     else:
>         return "Error: Unable to fetch weather data."
> 
> # Execute the function and prepare the final answer
> result = get_weather("New York")
> final_answer = f"The current weather in New York is: {result}"
> print(final_answer)
> ```
> 
> In this example, the Code Agent:
> 
> - Retrieves weather data **via an API call**,
> - Processes the response,
> - And uses the print() function to output a final answer.
> 
> This method **also follows the stop and parse approach** by clearly delimiting the code block and signaling when execution is complete (here, by printing the final_answer).
> 
> ---
> 
> We learned that Actions bridge an agent's internal reasoning and its real-world interactions by executing clear, structured tasks—whether through JSON, code, or function calls.
> 
> This deliberate execution ensures that each action is precise and ready for external processing via the stop and parse approach. In the next section, we will explore Observations to see how agents capture and integrate feedback from their environment.
> 
> After this, we will **finally be ready to build our first Agent!**
> 
> 
> 
> 
> 
> 
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `hf-actions` 第70～90行，章节：Actions:  Enabling the Agent to Engage with Its Environment / Code Agents

> ## Code Agents
> 
> An alternative approach is using *Code Agents*.
> The idea is: **instead of outputting a simple JSON object**, a Code Agent generates an **executable code block—typically in a high-level language like Python**. 
> 
> <img src="https://huggingface.co/datasets/agents-course/course-images/resolve/main/en/unit1/code-vs-json-actions.png" alt="Code Agents" />
> 
> This approach offers several advantages:
> 
> - **Expressiveness:** Code can naturally represent complex logic, including loops, conditionals, and nested functions, providing greater flexibility than JSON.
> - **Modularity and Reusability:** Generated code can include functions and modules that are reusable across different actions or tasks.
> - **Enhanced Debuggability:** With a well-defined programming syntax, code errors are often easier to detect and correct.
> - **Direct Integration:** Code Agents can integrate directly with external libraries and APIs, enabling more complex operations such as data processing or real-time decision

- `lg-retrieval` 第324～377行，章节：RAG architectures / Agentic RAG

>     system_prompt=system_prompt,  # [!code highlight]
>     name="Agentic RAG",
> )
> 
> response = agent.invoke({
>     'messages': [
>         HumanMessage(content=(
>             "Write a short example of a langgraph agent using the "
>             "prebuilt create react agent. the agent should be able "
>             "to look up stock pricing information."
>         ))
>     ]
> })
> 
> print(response['messages'][-1].content)
> ```
> :::
> :::js
> ```typescript
> import { tool, createAgent, HumanMessage } from "langchain";
> import * as z from "zod";
> 
> const ALLOWED_DOMAINS = ["https://langchain-ai.github.io/"];
> const LLMS_TXT = "https://langchain-ai.github.io/langgraph/llms.txt";
> 
> const fetchDocumentation = tool(
>   async (input) => {  // [!code highlight]
>     if (!ALLOWED_DOMAINS.some((domain) => input.url.startsWith(domain))) {
>       return `Error: URL not allowed. Must start with one of: ${ALLOWED_DOMAINS.join(", ")}`;
>     }
>     const response = await fetch(input.url);
>     if (!response.ok) {
>       throw new Error(`HTT

- `lg-retrieval` 第226～279行，章节：RAG architectures / Agentic RAG

>     response.raise_for_status()
>     return response.text
> 
> system_prompt = """\
> Use fetch_url when you need to fetch information from a web-page; quote relevant snippets.
> """
> 
> agent = create_agent(
>     model="claude-sonnet-4-6",
>     tools=[fetch_url], # A tool for retrieval [!code highlight]
>     system_prompt=system_prompt,
> )
> ```
> :::
> 
> :::js
> ```typescript
> import { tool, createAgent } from "langchain";
> 
> const fetchUrl = tool(
>     (url: string) => {
>         return `Fetched content from ${url}`;
>     },
>     { name: "fetch_url", description: "Fetch text content from a URL" }
> );
> 
> const agent = createAgent({
>     model: "claude-sonnet-4-6",
>     tools: [fetchUrl],
>     systemPrompt,
> });
> ```
> :::
> 
> <Expandable title="Extended example: Agentic RAG for LangGraph's llms.txt">
> 
> This example implements an **Agentic RAG system** to assist users in querying LangGraph documentation. The agent begins by loading [llms.txt](https://llmstxt.org/), which lists available documentation URLs, and can then dynamicall

### a13：为什么等我点批准后，批准之前的数据库写入又发生了一次？怎么避免重复副作用？

需要判断：说明节点恢复会重跑；使用幂等写入或把副作用放到中断后/独立节点，不能说从暂停行无副作用续跑。

阅读来源：[Interrupts](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langgraph/interrupts.mdx)

模型回答（未人工评分）：

## 原因：恢复时节点会**从头重跑**，而不是从 `interrupt()` 那一行“接着往下走”

文档明确写了这个机制：

> Because interrupts work by **re-running the nodes they were called from**, side effects called before `interrupt` should (ideally) be idempotent. [S8]

也就是说，你点批准后，LangGraph 会重新执行整个节点函数。你写在 `interrupt()` **之前**的那条 `db.create_audit_log(...)` 或 `append_to_history(...)` 就会再跑一遍——原注释也直接说明了后果：“This will create duplicate records on each resume” [S10]、“This will add duplicate entries on each resume” [S11]。

补充解释：在重跑时，`interrupt()` 本身不会再次阻塞，而是直接返回你通过 `Command({ resume: ... })` 传入的值（如 `true`/`false` [S4][S5]）。所以阻塞消失了，但**它前面的代码已经重新执行过了**。

另外，`thread_id` 只是指向同一个检查点的游标，复用它会恢复同一 checkpoint [S1]；这解释了“为什么是同一个节点被恢复”，但不改变“节点重跑”这一事实。

## 避免重复副作用的三种做法

文档给了三条正面规则 [S8]：

1. **使用幂等操作**（如 upsert）——同一操作执行多次结果不变 [S8]
2. **把副作用放到 `interrupt()` 之后**——只有拿到批准后才执行一次 [S8]
3. **把副作用拆到单独节点**——审批节点只负责 interrupt，通知/写库放在后续节点 [S8][S9][S10]

### 做法一：改成幂等写入

```python
# ✅ Good: using upsert operation which is idempotent
db.upsert_user(user_id=state["user_id"], status="pending_approval")
approved = interrupt("Approve this change?")
```
[S8]

### 做法二：副作用挪到 interrupt 之后

```python
approved = interrupt("Approve this change?")
if approved:
    db.create_audit_log(...)   # 只在批准后跑一次
```
[S8]

### 做法三：拆成两个节点

```python
def approval_node(state):
    approved = interrupt("Approve this change?")
    return {"approved": approved}

def notification_node(state):
    if state.approved:
        send_notification(...)   # 独立节点，只在批准后执行一次
    return state
```
[S9][S10]

## 明确要避免的写法

文档的反例清单 [S10]：

- 🔴 不要在 `interrupt()` 前做非幂等操作
- 🔴 不要不检查记录是否已存在就创建新记录
- 具体反例：在 interrupt 前 `db.create_audit_log({..., "timestamp": datetime.now()})`——每次恢复都会新建一条重复记录 [S10]
- 具体反例：在 interrupt 前 `db.append_to_history(...)`——每次恢复都会重复追加 [S10][S11]

## 落到你的场景

你那条“批准前的数据库写入”如果带时间戳、自增 ID 或 append 语义，就必然重复。可选修法：

- 若这条写入是“标记待审批”，改成 upsert（按 `user_id` 覆盖）[S8]；
- 若这条写入是“记录审计事件”，把它移到 `interrupt()` 之后的条件分支里 [S8]；
- 若这条写入还需要在等待期间就可见（比如给审批人展示），把它拆到 interrupt 之前的**独立幂等节点**，并把真正的“一次性副作用”放到批准后的节点 [S9][S10]。

---

说明：本轮提供的是文档的部分片段（`partial_document`），以上结论仅基于 S1–S11 这些片段；片段之外是否还有其它推荐机制（例如某些去重/重放控制手段），无法从当前证据判断。

自动引用ID检查：`{"cited_ids": ["S8", "S10", "S11", "S4", "S5", "S1", "S9"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] 正文，阅读包第29～35行**

> - **Checkpointing keeps your place:** the checkpointer writes the exact graph state so you can resume later, even when in an error state.
> - **`thread_id` is your pointer:** use `{ configurable: { thread_id: ... } }` as options to the `invoke` method to tell the checkpointer which state to load.
> - **Interrupt payloads surface as `__interrupt__`:** the values you pass to `interrupt()` return to the caller in the `__interrupt__` field so you know what the graph is waiting on.
> :::
> 
> The `thread_id` you choose is effectively your persistent cursor. Reusing it resumes the same checkpoint; using a new value starts a brand-new thread with an empty state.
> 
> 

**[S2] Resuming interrupts，阅读包第141～146行**

> `new Command({ resume: ... })` is the **only** `Command` pattern intended as input to `invoke()`/`stream()`/`stream_events()`. The other `Command` parameters (`update`, `goto`, `graph`) are designed for [returning from node functions](/oss/langgraph/graph-api#command). Do not pass `new Command({ update: ... })` as input to continue multi-turn conversations—pass a plain input object instead.
> 
> </Warning>
> 
> :::
> 
> 

**[S3] Common patterns / Handling multiple interrupts，阅读包第366～390行**

>       { id: '...', value: 'question_a' },
>       { id: '...', value: 'question_b' }
>     ]
>   }
>   */
> 
>   // Step 2: resume all pending interrupts at once
>   const resumeMap: Record<string, string> = {};
>   if (isInterrupted(interruptedResult)) {
>     for (const i of interruptedResult[INTERRUPT]) {
>       if (i.id != null) {
>         resumeMap[i.id] = `answer for ${i.value}`;
>       }
>     }
>   }
>   const result = await graph.invoke(new Command({ resume: resumeMap }), config);
> 
>   console.log("Final state:", result);
>   //> Final state: { vals: ['a:answer for question_a', 'b:answer for question_b'] }
> }
> 
> main().catch(console.error);
> ```
> :::
> 
> 

**[S4] Common patterns / Approve or reject，阅读包第391～442行**

> ### Approve or reject
> 
> One of the most common uses of interrupts is to pause before a critical action and ask for approval. For example, you might want to ask a human to approve an API call, a database change, or any other important decision.
> 
> :::python
> ```python
> from typing import Literal
> from langgraph.types import interrupt, Command
> 
> def approval_node(state: State) -> Command[Literal["proceed", "cancel"]]:
>     # Pause execution; payload shows up on stream.interrupts (with stream_events) or result["__interrupt__"] (with invoke)
>     is_approved = interrupt({
>         "question": "Do you want to proceed with this action?",
>         "details": state["action_details"]
>     })
> 
>     # Route based on the response
>     if is_approved:
>         return Command(goto="proceed")  # Runs after the resume payload is provided
>     else:
>         return Command(goto="cancel")
> ```
> :::
> 
> :::js
> ```typescript
> import { interrupt, Command } from "@langchain/langgraph";
> 
> const approvalNode: typeof State.Node = (state) => {
>   // Pause execution; payload surfaces in result.__interrupt__
>   const isApproved = interrupt({
>     question: "Do you want to proceed?",
>     details: state.actionDetails
>   });
> 
>   // Route based on the response
>   if (isApproved) {
>     return new Command({ goto: "proceed" }); // Runs after the resume payload is provided
>   } else {
>     return new Command({ goto: "cancel" });
>   }
> }
> ```
> :::
> 
> :::python
> When you resume the graph, pass `True` to approve or `False` to reject:
> ```python
> # To approve
> graph.stream_events(Command(resume=True), config=config, version="v3").output
> 
> # To reject
> 

**[S5] Common patterns / Approve or reject，阅读包第443～502行**

> graph.stream_events(Command(resume=False), config=config, version="v3").output
> ```
> :::
> 
> :::js
> When you resume the graph, pass `true` to approve or `false` to reject:
> ```typescript
> // To approve
> await graph.invoke(new Command({ resume: true }), config);
> 
> // To reject
> await graph.invoke(new Command({ resume: false }), config);
> ```
> :::
> 
> <Accordion title="Full example">
>     :::python
> 
>     <LanggraphInterruptsApprovalPy />
> 
>     :::
> 
>     :::js
> 
>     ```typescript
>     import {
>       Command,
>       MemorySaver,
>       START,
>       END,
>       StateGraph,
>       StateSchema,
>       interrupt,
>     } from "@langchain/langgraph";
>     import * as z from "zod";
> 
>     const State = new StateSchema({
>       actionDetails: z.string(),
>       status: z.enum(["pending", "approved", "rejected"]).nullable(),
>     });
> 
>     const graphBuilder = new StateGraph(State)
>       .addNode("approval", async (state) => {
>         // Expose details so the caller can render them in a UI
>         const decision = interrupt({
>           question: "Approve this action?",
>           details: state.actionDetails,
>         });
>         return new Command({ goto: decision ? "proceed" : "cancel" });
>       }, { ends: ['proceed', 'cancel'] })
>       .addNode("proceed", () => ({ status: "approved" }))
>       .addNode("cancel", () => ({ status: "rejected" }))
>       .addEdge(START, "approval")
>       .addEdge("proceed", END)
>       .addEdge("cancel", END);
> 
>     // Use a more durable checkpointer in production
>     const checkpointer = new MemorySaver();
>     const graph = graphBuilder.compile({ checkpointer });
> 
> 

**[S6] Rules of interrupts / Do not return complex values in `interrupt` calls，阅读包第1270～1337行**

>     currentValues: state.user || {}
>   });
> 
>   return { user: response };
> }
> ```
> </CodeGroup>
> :::
> 
> * 🔴 Do not pass functions, class instances, or other complex objects to @[`interrupt`]
> 
> :::python
> <CodeGroup>
> ```python Functions
> def validate_input(value):
>     return len(value) > 0
> 
> def node_a(state: State):
>     # ❌ Bad: passing a function to interrupt
>     # The function cannot be serialized
>     response = interrupt({
>         "question": "What's your name?",
>         "validator": validate_input  # This will fail
>     })
>     return {"name": response}
> ```
> ```python Class instances
> class DataProcessor:
>     def __init__(self, config):
>         self.config = config
> 
> def node_a(state: State):
>     processor = DataProcessor({"mode": "strict"})
> 
>     # ❌ Bad: passing a class instance to interrupt
>     # The instance cannot be serialized
>     response = interrupt({
>         "question": "Enter data to process",
>         "processor": processor  # This will fail
>     })
>     return {"result": response}
> ```
> </CodeGroup>
> :::
> 
> :::js
> <CodeGroup>
> ```typescript Functions
> function validateInput(value: string): boolean {
>     return value.length > 0;
> }
> 
> const nodeA: GraphNode<typeof State> = async (state) => {
>   // ❌ Bad: passing a function to interrupt
>   // The function cannot be serialized
>   const response = interrupt({
>     question: "What's your name?",
>     validator: validateInput  // This will fail
>   });
>   return { name: response };
> }
> ```
> ```typescript Class instances
> class DataProcessor {
>     constructor(private config: any) {}
> }
> 
> const nodeA: GraphNode<typeof State> = async (state) => {
> 

**[S7] Rules of interrupts / Do not return complex values in `interrupt` calls，阅读包第1338～1351行**

>   const processor = new DataProcessor({ mode: "strict" });
> 
>   // ❌ Bad: passing a class instance to interrupt
>   // The instance cannot be serialized
>   const response = interrupt({
>     question: "Enter data to process",
>     processor: processor  // This will fail
>   });
>   return { result: response };
> }
> ```
> </CodeGroup>
> :::
> 
> 

**[S8] Rules of interrupts / Side effects called before `interrupt` must be idempotent，阅读包第1352～1391行**

> ### Side effects called before `interrupt` must be idempotent
> 
> Because interrupts work by re-running the nodes they were called from, side effects called before @[`interrupt`] should (ideally) be idempotent. For context, idempotency means that the same operation can be applied multiple times without changing the result beyond the initial execution.
> 
> As an example, you might have an API call to update a record inside of a node. If @[`interrupt`] is called after that call is made, it will be re-run multiple times when the node is resumed, potentially overwriting the initial update or creating duplicate records.
> 
> * ✅ Use idempotent operations before @[`interrupt`]
> * ✅ Place side effects after @[`interrupt`] calls
> * ✅ Separate side effects into separate nodes when possible
> 
> :::python
> <CodeGroup>
> ```python Idempotent operations
> def node_a(state: State):
>     # ✅ Good: using upsert operation which is idempotent
>     # Running this multiple times will have the same result
>     db.upsert_user(
>         user_id=state["user_id"],
>         status="pending_approval"
>     )
> 
>     approved = interrupt("Approve this change?")
> 
>     return {"approved": approved}
> ```
> ```python Side effects after interrupt
> def node_a(state: State):
>     # ✅ Good: placing side effect after the interrupt
>     # This ensures it only runs once after approval is received
>     approved = interrupt("Approve this change?")
> 
>     if approved:
>         db.create_audit_log(
>             user_id=state["user_id"],
>             action="approved"
>         )
> 
>     return {"approved": approved}
> ```
> ```python Separating into different nodes
> 

**[S9] Rules of interrupts / Side effects called before `interrupt` must be idempotent，阅读包第1392～1451行**

> def approval_node(state: State):
>     # ✅ Good: only handling the interrupt in this node
>     approved = interrupt("Approve this change?")
> 
>     return {"approved": approved}
> 
> def notification_node(state: State):
>     # ✅ Good: side effect happens in a separate node
>     # This runs after approval, so it only executes once
>     if (state.approved):
>         send_notification(
>             user_id=state["user_id"],
>             status="approved"
>         )
> 
>     return state
> ```
> </CodeGroup>
> :::
> 
> :::js
> <CodeGroup>
> ```typescript Idempotent operations
> const nodeA: GraphNode<typeof State> = async (state) => {
>   // ✅ Good: using upsert operation which is idempotent
>   // Running this multiple times will have the same result
>   await db.upsertUser({
>     userId: state.userId,
>     status: "pending_approval"
>   });
> 
>   const approved = interrupt("Approve this change?");
> 
>   return { approved };
> }
> ```
> ```typescript Side effects after interrupt
> const nodeA: GraphNode<typeof State> = async (state) => {
>   // ✅ Good: placing side effect after the interrupt
>   // This ensures it only runs once after approval is received
>   const approved = interrupt("Approve this change?");
> 
>   if (approved) {
>     await db.createAuditLog({
>       userId: state.userId,
>       action: "approved"
>     });
>   }
> 
>   return { approved };
> }
> ```
> ```typescript Separating into different nodes
> const approvalNode: GraphNode<typeof State> = async (state) => {
>   // ✅ Good: only handling the interrupt in this node
>   const approved = interrupt("Approve this change?");
> 
>   return { approved };
> }
> 
> 

**[S10] Rules of interrupts / Side effects called before `interrupt` must be idempotent，阅读包第1452～1511行**

> const notificationNode: GraphNode<typeof State> = async (state) => {
>   // ✅ Good: side effect happens in a separate node
>   // This runs after approval, so it only executes once
>   if (state.approved) {
>     await sendNotification({
>       userId: state.userId,
>       status: "approved",
>     });
>   }
> 
>   return state;
> }
> ```
> </CodeGroup>
> :::
> 
> * 🔴 Do not perform non-idempotent operations before @[`interrupt`]
> * 🔴 Do not create new records without checking if they exist
> 
> :::python
> <CodeGroup>
> ```python Creating records
> def node_a(state: State):
>     # ❌ Bad: creating a new record before interrupt
>     # This will create duplicate records on each resume
>     audit_id = db.create_audit_log({
>         "user_id": state["user_id"],
>         "action": "pending_approval",
>         "timestamp": datetime.now()
>     })
> 
>     approved = interrupt("Approve this change?")
> 
>     return {"approved": approved, "audit_id": audit_id}
> ```
> ```python Appending to lists
> def node_a(state: State):
>     # ❌ Bad: appending to a list before interrupt
>     # This will add duplicate entries on each resume
>     db.append_to_history(state["user_id"], "approval_requested")
> 
>     approved = interrupt("Approve this change?")
> 
>     return {"approved": approved}
> ```
> </CodeGroup>
> :::
> 
> :::js
> <CodeGroup>
> ```typescript Creating records
> const nodeA: GraphNode<typeof State> = async (state) => {
>   // ❌ Bad: creating a new record before interrupt
>   // This will create duplicate records on each resume
>   const auditId = await db.createAuditLog({
>     userId: state.userId,
>     action: "pending_approval",
>     timestamp: new Date()
>   });
> 
> 

**[S11] Rules of interrupts / Side effects called before `interrupt` must be idempotent，阅读包第1512～1530行**

>   const approved = interrupt("Approve this change?");
> 
>   return { approved, auditId };
> }
> ```
> ```typescript Appending to arrays
> const nodeA: GraphNode<typeof State> = async (state) => {
>   // ❌ Bad: appending to an array before interrupt
>   // This will add duplicate entries on each resume
>   await db.appendToHistory(state.userId, "approval_requested");
> 
>   const approved = interrupt("Approve this change?");
> 
>   return { approved };
> }
> ```
> </CodeGroup>
> :::
> 
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `lg-persistence` 第100～115行，章节：Troubleshooting common issues / Checkpoints growing unboundedly

> ### Checkpoints growing unboundedly
> 
> Over long conversations, checkpoints accumulate. This can increase latency and storage costs.
> 
> **Fix:** Prune old checkpoints periodically or set a retention policy:
> 
> :::python
> ```python
> from langgraph.checkpoint.postgres import PostgresSaver
> 
> checkpointer = PostgresSaver.from_conn_string("postgresql://...")
> checkpointer.setup()  # Creates tables with indexes
> # Consider adding a cron job to delete checkpoints older than N days
> ```
> :::
> 
> 

- `lg-interrupts` 第1452～1511行，章节：Rules of interrupts / Side effects called before `interrupt` must be idempotent

> const notificationNode: GraphNode<typeof State> = async (state) => {
>   // ✅ Good: side effect happens in a separate node
>   // This runs after approval, so it only executes once
>   if (state.approved) {
>     await sendNotification({
>       userId: state.userId,
>       status: "approved",
>     });
>   }
> 
>   return state;
> }
> ```
> </CodeGroup>
> :::
> 
> * 🔴 Do not perform non-idempotent operations before @[`interrupt`]
> * 🔴 Do not create new records without checking if they exist
> 
> :::python
> <CodeGroup>
> ```python Creating records
> def node_a(state: State):
>     # ❌ Bad: creating a new record before interrupt
>     # This will create duplicate records on each resume
>     audit_id = db.create_audit_log({
>         "user_id": state["user_id"],
>         "action": "pending_approval",
>         "timestamp": datetime.now()
>     })
> 
>     approved = interrupt("Approve this change?")
> 
>     return {"approved": approved, "audit_id": audit_id}
> ```
> ```python Appending to lists
> def node_a(state: State):
>     # ❌ Bad: appending to a li

- `lg-interrupts` 第1338～1351行，章节：Rules of interrupts / Do not return complex values in `interrupt` calls

>   const processor = new DataProcessor({ mode: "strict" });
> 
>   // ❌ Bad: passing a class instance to interrupt
>   // The instance cannot be serialized
>   const response = interrupt({
>     question: "Enter data to process",
>     processor: processor  // This will fail
>   });
>   return { result: response };
> }
> ```
> </CodeGroup>
> :::
> 
> 

### a20：ToolStrategy输出校验失败时，handle_errors=False与指定ValueError有什么区别？

需要判断：False让错误抛出；ValueError仅对匹配类型重试，其余抛出。

阅读来源：[Structured output](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx)

模型回答（未人工评分）：

结论：`handle_errors=False` 是**完全关闭错误处理**；`handle_errors=ValueError` 是**只对 `ValueError` 这一类异常启用重试处理**。

| 配置 | 捕获范围 | 校验失败时 | 其他异常 | 是否重试 |
|---|---|---|---|---|
| `handle_errors=False` | 不捕获任何异常 | 不生成错误提示 Tool Message，异常直接向上抛出 | 直接抛出 | 否 |
| `handle_errors=ValueError` | 仅捕获 `ValueError` | 若实际异常是 `ValueError`，使用默认错误消息提示模型重试 | 原样抛出 | 仅匹配 `ValueError` 时重试 |

具体区别：

1. **`False`：全局关闭**
   - 文档说明：`False` 表示“No retry, let exceptions propagate”，即不重试，让异常继续抛出。[S3]
   - 因此任何校验错误都不会被转换成给模型的纠错消息，而是直接交给调用方处理。

2. **`ValueError`：选择性处理**
   - 文档说明：传入异常类型时，只有抛出的异常属于该类型才重试，并使用默认错误消息；其他情况异常会被抛出。[S3][S7]
   - 也就是说，它不会像 `False` 那样“所有错误都直接抛”，也不会像 `handle_errors=True` 那样“所有错误都按默认模板处理”。

3. **对“输出校验失败”的关键限制**
   - 文档中结构化输出校验失败相关异常包括 `StructuredOutputValidationError` 和 `MultipleStructuredOutputsError`。[S8]
   - 但当前片段没有说明 `StructuredOutputValidationError` 是否继承自 `ValueError`。因此不能仅凭现有片段断定 `handle_errors=ValueError` 一定能捕获“输出校验失败”。
   - 如果实际抛出的是 `StructuredOutputValidationError`，且它不是 `ValueError` 的子类，那么 `handle_errors=ValueError` 不会匹配，异常会直接抛出；而 `handle_errors=False` 无论异常类型如何都不会重试。

简单说：  
**`False` 是“所有错误都不处理”；`ValueError` 是“只有 `ValueError` 才处理并重试，其他错误照常抛出”。** 两者都不会静默接受无效输出。

自动引用ID检查：`{"cited_ids": ["S3", "S7", "S8"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Provider strategy，阅读包第330～365行**

>         "required": ["name", "email", "phone"]
>     }
> 
>     const agent = createAgent({
>         model: "gpt-5.5",
>         tools: [],
>         responseFormat: providerStrategy(contactInfoSchema)
>     });
> 
>     const result = await agent.invoke({
>         messages: [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     });
> 
>     console.log(result.structuredResponse);
>     // { name: "John Doe", email: "john@example.com", phone: "(555) 123-4567" }
>     ```
> </CodeGroup>
> :::
> 
> Provider-native structured output provides high reliability and strict validation because the model provider enforces the schema. Use it when available.
> 
> :::python
> <Note>
>     If the provider natively supports structured output for your model choice, it is functionally equivalent to write `response_format=ProductReview` instead of `response_format=ProviderStrategy(ProductReview)`.
> 
>     In either case, if structured output is not supported, the agent will fall back to a tool calling strategy.
> </Note>
> :::
> :::js
> <Note>
>     If the provider natively supports structured output for your model choice, it is functionally equivalent to write `responseFormat: contactInfoSchema` instead of `responseFormat: providerStrategy(contactInfoSchema)`.
> 
>     In either case, if structured output is not supported, the agent will fall back to a tool calling strategy.
> </Note>
> :::
> 
> 

**[S2] Tool calling strategy，阅读包第366～403行**

> ## Tool calling strategy
> 
> For models that don't support native structured output, LangChain uses tool calling to achieve the same result. This works with all models that support tool calling (most modern models).
> 
> To use this strategy, configure a `ToolStrategy`:
> 
> :::python
> ```python
> class ToolStrategy(Generic[SchemaT]):
>     schema: type[SchemaT]
>     tool_message_content: str | None
>     handle_errors: Union[
>         bool,
>         str,
>         type[Exception],
>         tuple[type[Exception], ...],
>         Callable[[Exception], str],
>     ]
> ```
> 
> <ParamField path="schema" required>
>     The schema defining the structured output format. Supports:
>     - **Pydantic models**: `BaseModel` subclasses with field validation. Returns validated Pydantic instance.
>     - **Dataclasses**: Python dataclasses with type annotations. Returns dict.
>     - **TypedDict**: Typed dictionary classes. Returns dict.
>     - **JSON Schema**: Dictionary with JSON schema specification. Must include top-level `title` and `description` keys. Returns dict.
>     - **Union types**: Multiple schema options. The model will choose the most appropriate schema based on the context.
> </ParamField>
> 
> <ParamField path="tool_message_content">
>     Custom content for the tool message returned when structured output is generated.
>     If not provided, defaults to a message showing the structured response data.
> </ParamField>
> 
> <ParamField path="handle_errors">
>     Error handling strategy for structured output validation failures. Defaults to `True`.
> 
>     - **`True`**: Catch all errors with default error template
> 

**[S3] Tool calling strategy，阅读包第404～441行**

>     - **`str`**: Catch all errors with this custom message
>     - **`type[Exception]`**: Only catch this exception type with default message
>     - **`tuple[type[Exception], ...]`**: Only catch these exception types with default message
>     - **`Callable[[Exception], str]`**: Custom function that returns error message
>     - **`False`**: No retry, let exceptions propagate
> </ParamField>
> 
> <CodeGroup>
>     ```python Pydantic Model
>     from pydantic import BaseModel, Field
>     from typing import Literal
>     from langchain.agents import create_agent
>     from langchain.agents.structured_output import ToolStrategy
> 
> 
>     class ProductReview(BaseModel):
>         """Analysis of a product review."""
>         rating: int | None = Field(description="The rating of the product", ge=1, le=5)
>         sentiment: Literal["positive", "negative"] = Field(description="The sentiment of the review")
>         key_points: list[str] = Field(description="The key points of the review. Lowercase, 1-3 words each.")
> 
>     agent = create_agent(
>         model="gpt-5.5",
>         tools=[],
>         response_format=ToolStrategy(ProductReview)
>     )
> 
>     result = agent.invoke({
>         "messages": [{"role": "user", "content": "Analyze this review: 'Great product: 5 out of 5 stars. Fast shipping, but expensive'"}]
>     })
>     result["structured_response"]
>     # ProductReview(rating=5, sentiment='positive', key_points=['fast shipping', 'expensive'])
>     ```
> 
>     ```python Dataclass
>     from dataclasses import dataclass
>     from typing import Literal
>     from langchain.agents import create_agent
> 

**[S4] Tool calling strategy / Custom tool message content，阅读包第821～834行**

> ```ts
> # console.log(result);
> /**
>  * {
>  *   messages: [
>  *     ...
>  *     { role: "tool", content: "Returning structured response: {'task': 'update the project timeline', 'assignee': 'Sarah', 'priority': 'high'}", tool_call_id: "call_456", name: "MeetingAction" }
>  *   ],
>  *   structuredResponse: { task: "update the project timeline", assignee: "Sarah", priority: "high" }
>  * }
>  */
> ```
> :::
> 
> 

**[S5] Tool calling strategy / Error handling，阅读包第835～838行**

> ### Error handling
> 
> Models can make mistakes when generating structured output via tool calling. LangChain provides intelligent retry mechanisms to handle these errors automatically.
> 
> 

**[S6] Tool calling strategy / Error handling / Schema validation error，阅读包第1007～1015行**

>   Args:
>     rating: 5
>     comment: Amazing product
> ================================= Tool Message =================================
> Name: ProductRating
> 
> Returning structured response: {'rating': 5, 'comment': 'Amazing product'}
> ```
> 
> 

**[S7] Tool calling strategy / Error handling / Error handling strategies，阅读包第1016～1063行**

> #### Error handling strategies
> 
> You can customize how errors are handled using the `handle_errors` parameter:
> 
> **Custom error message:**
> ```python
> ToolStrategy(
>     schema=ProductRating,
>     handle_errors="Please provide a valid rating between 1-5 and include a comment."
> )
> ```
> If `handle_errors` is a string, the agent will *always* prompt the model to re-try with a fixed tool message:
> ```
> ================================= Tool Message =================================
> Name: ProductRating
> 
> Please provide a valid rating between 1-5 and include a comment.
> ```
> 
> **Handle specific exceptions only:**
> 
> ```python
> ToolStrategy(
>     schema=ProductRating,
>     handle_errors=ValueError  # Only retry on ValueError, raise others
> )
> ```
> 
> If `handle_errors` is an exception type, the agent will only retry (using the default error message) if the exception raised is the specified type. In all other cases, the exception will be raised.
> 
> **Handle multiple exception types:**
> ```python
> ToolStrategy(
>     schema=ProductRating,
>     handle_errors=(ValueError, TypeError)  # Retry on ValueError and TypeError
> )
> ```
> 
> If `handle_errors` is a tuple of exceptions, the agent will only retry (using the default error message) if the exception raised is one of the specified types. In all other cases, the exception will be raised.
> 
> **Custom error handler function:**
> 
> ```python
> 
> from langchain.agents.structured_output import StructuredOutputValidationError
> from langchain.agents.structured_output import MultipleStructuredOutputsError
> 
> def custom_error_handler(error: Exception) -> str:
> 

**[S8] Tool calling strategy / Error handling / Error handling strategies，阅读包第1064～1114行**

>     if isinstance(error, StructuredOutputValidationError):
>         return "There was an issue with the format. Try again."
>     elif isinstance(error, MultipleStructuredOutputsError):
>         return "Multiple structured outputs were returned. Pick the most relevant one."
>     else:
>         return f"Error: {str(error)}"
> 
> 
> agent = create_agent(
>     model="gpt-5.5",
>     tools=[],
>     response_format=ToolStrategy(
>                         schema=Union[ContactInfo, EventDetails],
>                         handle_errors=custom_error_handler
>                     )  # Default: handle_errors=True
> )
> 
> result = agent.invoke({
>     "messages": [{"role": "user", "content": "Extract info: John Doe (john@email.com) is organizing Tech Conference on March 15th"}]
> })
> 
> for msg in result['messages']:
>     # If message is actually a ToolMessage object (not a dict), check its class name
>     if type(msg).__name__ == "ToolMessage":
>         print(msg.content)
>     # If message is a dictionary or you want a fallback
>     elif isinstance(msg, dict) and msg.get('tool_call_id'):
>         print(msg['content'])
> 
> ```
> 
> On `StructuredOutputValidationError`:
> ```
> ================================= Tool Message =================================
> Name: ToolStrategy
> 
> There was an issue with the format. Try again.
> ```
> 
> On `MultipleStructuredOutputsError`:
> 
> ```
> ================================= Tool Message =================================
> Name: ToolStrategy
> 
> Multiple structured outputs were returned. Pick the most relevant one.
> ```
> 
> On other errors:
> 
> ```
> 

**[S9] Tool calling strategy / Error handling / Error handling strategies，阅读包第1115～1163行**

> ================================= Tool Message =================================
> Name: ToolStrategy
> 
> Error: <error message>
> ```
> 
> **No error handling:**
> 
> ```python
> response_format = ToolStrategy(
>     schema=ProductRating,
>     handle_errors=False  # All errors raised
> )
> ```
> :::
> :::js
> ```ts
> import * as z from "zod";
> import { createAgent, toolStrategy } from "langchain";
> 
> const ProductRating = z.object({
>     rating: z.number().min(1).max(5).describe("Rating from 1-5"),
>     comment: z.string().describe("Review comment"),
> });
> 
> const agent = createAgent({
>     model: "gpt-5.5",
>     tools: [],
>     responseFormat: toolStrategy(ProductRating),
> });
> 
> const result = await agent.invoke({
>     messages: [
>         {
>         role: "user",
>         content: "Parse this: Amazing product, 10/10!",
>         },
>     ],
> });
> 
> console.log(result);
> 
> /**
>  * {
>  *   messages: [
>  *     { role: "user", content: "Parse this: Amazing product, 10/10!" },
>  *     { role: "assistant", content: "", tool_calls: [ { name: "ProductRating", args: { rating: 10, comment: "Amazing product" }, id: "call_1" } ] },
>  *     { role: "tool", content: "Error: Failed to parse structured output for tool 'ProductRating': 1 validation error for ProductRating\nrating\n  Input should be less than or equal to 5 [type=less_than_equal, input_value=10, input_type=int].\n Please fix your mistakes.", tool_call_id: "call_1", name: "ProductRating" },
>  *     { role: "assistant", content: "", tool_calls: [ { name: "ProductRating", args: { rating: 5, comment: "Amazing product" }, id: "call_2" } ] },
> 

**[S10] Tool calling strategy / Error handling / Error handling strategies，阅读包第1164～1170行**

>  *     { role: "tool", content: "Returning structured response: {'rating': 5, 'comment': 'Amazing product'}", tool_call_id: "call_2", name: "ProductRating" }
>  *   ],
>  *   structuredResponse: { rating: 5, comment: "Amazing product" }
>  * }
>  */
> ```
> 
> 

**[S11] Tool calling strategy / Error handling / Error handling strategies，阅读包第1171～1227行**

> #### Error handling strategies
> 
> You can customize how errors are handled using the `handleErrors` parameter:
> 
> **Custom error message:**
> 
> ```ts
> const responseFormat = toolStrategy(ProductRating, {
>     handleError: "Please provide a valid rating between 1-5 and include a comment."
> )
> 
> // Error message becomes:
> // { role: "tool", content: "Please provide a valid rating between 1-5 and include a comment." }
> ```
> 
> **Handle specific exceptions only:**
> 
> ```ts
> import { ToolInputParsingException } from "@langchain/core/tools";
> 
> const responseFormat = toolStrategy(ProductRating, {
>     handleError: (error: ToolStrategyError) => {
>         if (error instanceof ToolInputParsingException) {
>         return "Please provide a valid rating between 1-5 and include a comment.";
>         }
>         return error.message;
>     }
> )
> 
> // Only validation errors get retried with default message:
> // { role: "tool", content: "Error: Failed to parse structured output for tool 'ProductRating': ...\n Please fix your mistakes." }
> ```
> 
> **Handle multiple exception types:**
> 
> ```ts
> const responseFormat = toolStrategy(ProductRating, {
>     handleError: (error: ToolStrategyError) => {
>         if (error instanceof ToolInputParsingException) {
>         return "Please provide a valid rating between 1-5 and include a comment.";
>         }
>         if (error instanceof CustomUserError) {
>         return "This is a custom user error.";
>         }
>         return error.message;
>     }
> )
> ```
> 
> **No error handling:**
> 
> ```ts
> const responseFormat = toolStrategy(ProductRating, {
>     handleError: false  // All errors raised
> )
> ```
> :::
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `lg-structured` 第1016～1063行，章节：Tool calling strategy / Error handling / Error handling strategies

> #### Error handling strategies
> 
> You can customize how errors are handled using the `handle_errors` parameter:
> 
> **Custom error message:**
> ```python
> ToolStrategy(
>     schema=ProductRating,
>     handle_errors="Please provide a valid rating between 1-5 and include a comment."
> )
> ```
> If `handle_errors` is a string, the agent will *always* prompt the model to re-try with a fixed tool message:
> ```
> ================================= Tool Message =================================
> Name: ProductRating
> 
> Please provide a valid rating between 1-5 and include a comment.
> ```
> 
> **Handle specific exceptions only:**
> 
> ```python
> ToolStrategy(
>     schema=ProductRating,
>     handle_errors=ValueError  # Only retry on ValueError, raise others
> )
> ```
> 
> If `handle_errors` is an exception type, the agent will only retry (using the default error message) if the exception raised is the specified type. In all other cases, the exception will be raised.
> 
> **Handle multiple exception types:**
> ```python
> ToolStrategy(
>     schema

- `lg-structured` 第1064～1114行，章节：Tool calling strategy / Error handling / Error handling strategies

>     if isinstance(error, StructuredOutputValidationError):
>         return "There was an issue with the format. Try again."
>     elif isinstance(error, MultipleStructuredOutputsError):
>         return "Multiple structured outputs were returned. Pick the most relevant one."
>     else:
>         return f"Error: {str(error)}"
> 
> 
> agent = create_agent(
>     model="gpt-5.5",
>     tools=[],
>     response_format=ToolStrategy(
>                         schema=Union[ContactInfo, EventDetails],
>                         handle_errors=custom_error_handler
>                     )  # Default: handle_errors=True
> )
> 
> result = agent.invoke({
>     "messages": [{"role": "user", "content": "Extract info: John Doe (john@email.com) is organizing Tech Conference on March 15th"}]
> })
> 
> for msg in result['messages']:
>     # If message is actually a ToolMessage object (not a dict), check its class name
>     if type(msg).__name__ == "ToolMessage":
>         print(msg.content)
>     # If message is a dictionary or you want a fallback
>     

- `lg-structured` 第1171～1227行，章节：Tool calling strategy / Error handling / Error handling strategies

> #### Error handling strategies
> 
> You can customize how errors are handled using the `handleErrors` parameter:
> 
> **Custom error message:**
> 
> ```ts
> const responseFormat = toolStrategy(ProductRating, {
>     handleError: "Please provide a valid rating between 1-5 and include a comment."
> )
> 
> // Error message becomes:
> // { role: "tool", content: "Please provide a valid rating between 1-5 and include a comment." }
> ```
> 
> **Handle specific exceptions only:**
> 
> ```ts
> import { ToolInputParsingException } from "@langchain/core/tools";
> 
> const responseFormat = toolStrategy(ProductRating, {
>     handleError: (error: ToolStrategyError) => {
>         if (error instanceof ToolInputParsingException) {
>         return "Please provide a valid rating between 1-5 and include a comment.";
>         }
>         return error.message;
>     }
> )
> 
> // Only validation errors get retried with default message:
> // { role: "tool", content: "Error: Failed to parse structured output for tool 'ProductRating': ...\n Please fix your mistake

### n01：这些资料给出的RAG端到端P99延迟保证是多少毫秒？

需要判断：所给资料没有这项数值或保证；不能编造。只读到片段时说明是当前证据不足，不能声称已检查全文。

阅读来源：[Retrieval](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx)

模型回答（未人工评分）：

**资料中没有给出任何端到端 P99 延迟的毫秒数值，也没有作出延迟保证（SLA/保证）。**

现有文档只给出了定性描述：

1. **延迟是架构对比中的一个维度，不是承诺指标。** 表里用“⚡ Fast / ⏳ Variable”标注三种架构：2-Step RAG 快、Agentic RAG 可变、Hybrid RAG 可变，没有任何毫秒级数字 [S3]。

2. **唯一涉及“可预测性”的说明是条件性的，而且明确附有例外。** 文档指出 2-Step RAG 的延迟总体上**更可预测**，因为 LLM 调用的最大次数是已知且有上限的；但这有一个前提假设——LLM 推理时间是主导因素。文档同时提醒，真实延迟还会受检索步骤性能影响，例如 API 响应时间、网络延迟、数据库查询，这些会随所用工具和基础设施而变化 [S3]。

3. 因此严格来说，文档连“2-Step RAG 一定延迟最低”都没有断言，只说在特定假设下更可预测，并且真实世界中可能被检索环节拉长 [S3]。

补充解释（非作者观点）：若你需要 P99 这类尾部指标，只能自行在你的工具链与基础设施上压测得到；文档的架构分类可作为选择测试对象的依据——2-Step RAG 的调用次数上限已知，便于估算最坏情况下的调用轮数，但单次调用耗时仍需实测。

如果你的文档意图是给出性能预期，建议要么删去“保证”类措辞、只保留“可预测性”这一相对表述，要么补充一组标明测量环境与数据集的实测分位数，并注明不是 SLA。

自动引用ID检查：`{"cited_ids": ["S3"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Building a knowledge base / From retrieval to RAG，阅读包第36～41行**

> ### From retrieval to RAG
> 
> Retrieval allows LLMs to access relevant context at runtime. But most real-world applications go one step further: they **integrate retrieval with generation** to produce grounded, context-aware answers.
> 
> This is the core idea behind **Retrieval-Augmented Generation (RAG)**. The retrieval pipeline becomes a foundation for a broader system that combines search with generation.
> 
> 

**[S2] Building a knowledge base / Building blocks，阅读包第76～129行**

> ### Building blocks
> 
> <Columns cols={2}>
>     <Card
>         title="Document loaders"
>         icon="file-import"
>         href="/oss/integrations/document_loaders"
>         arrow cta="Learn more"
>     >
>         Ingest data from external sources (Google Drive, Slack, Notion, etc.), returning standardized @[`Document`] objects.
>     </Card>
> 
>     :::python
>     <Card
>         title="Text splitters"
>         icon="scissors"
>         href="/oss/integrations/splitters"
>         arrow
>         cta="Learn more"
>     >
>         Break large docs into smaller chunks that will be retrievable individually and fit within a model's context window.
>     </Card>
>     :::
>     <Card
>         title="Embedding models"
>         icon="sitemap"
>         href="/oss/integrations/embeddings"
>         arrow
>         cta="Learn more"
>     >
>         An embedding model turns text into a vector of numbers so that texts with similar meaning land close together in that vector space.
>     </Card>
> 
>     <Card
>         title="Vector stores"
>         icon="database"
>         href="/oss/integrations/vectorstores/"
>         arrow
>         cta="Learn more"
>     >
>         Specialized databases for storing and searching embeddings.
>     </Card>
> 
>     <Card
>         title="Retrievers"
>         icon="binoculars"
>         href="/oss/integrations/retrievers/"
>         arrow
>         cta="Learn more"
>     >
>         A retriever is an interface that returns documents given an unstructured query.
>     </Card>
> </Columns>
> 
> 

**[S3] RAG architectures，阅读包第130～143行**

> ## RAG architectures
> 
> RAG can be implemented in multiple ways, depending on your system's needs. We outline each type in the sections below.
> 
> | Architecture            | Description                                                                | Control   | Flexibility | Latency        | Example Use Case                                   |
> |-------------------------|----------------------------------------------------------------------------|-----------|-------------|----------------|----------------------------------------------------|
> | **2-Step RAG**          | Retrieval always happens before generation. Simple and predictable         | ✅ High    | ❌ Low       | ⚡ Fast         | FAQs, documentation bots                           |
> | **Agentic RAG**         | An LLM-powered agent decides *when* and *how* to retrieve during reasoning | ❌ Low     | ✅ High      | ⏳ Variable     | Research assistants with access to multiple tools  |
> | **Hybrid**              | Combines characteristics of both approaches with validation steps          | ⚖️ Medium | ⚖️ Medium   | ⏳ Variable     | Domain-specific Q&A with quality validation        |
> 
> <Info>
> **Latency**: Latency is generally more **predictable** in **2-Step RAG**, as the maximum number of LLM calls is known and capped. This predictability assumes that LLM inference time is the dominant factor. However, real-world latency may also be affected by the performance of retrieval steps, such as API response times, network delays, or database queries, which can vary based on the tools and infrastructure in use.
> </Info>
> 
> 

**[S4] RAG architectures / 2-step RAG，阅读包第144～183行**

> ### 2-step RAG
> 
> In **2-Step RAG**, the retrieval step is always executed before the generation step. This architecture is straightforward and predictable, making it suitable for many applications where the retrieval of relevant documents is a clear prerequisite for generating an answer.
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B["Retrieve Relevant Documents"]
>     B --> C["Generate Answer"]
>     C --> D[Return Answer to User]
> 
>     %% Styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,D startend
>     class B,C process
> ```
> <br/>
> <CardGroup cols={2}>
>     <Card
>         title="Tutorial: Semantic search"
>         icon="database"
>         href="/oss/langchain/knowledge-base"
>         arrow
>         cta="Learn more"
>     >
>         Build a searchable knowledge base with document loaders, embeddings, and vector stores, then run a minimal retrieve-then-generate RAG workflow on top of it.
>     </Card>
>     <Card
>         title="Tutorial: Evaluate a RAG application"
>         icon="clipboard-check"
>         href="/langsmith/evaluate-rag-tutorial"
>         arrow
>         cta="Learn more"
>     >
>         Build a simple retrieve-then-generate RAG app and measure answer correctness, relevance, groundedness, and retrieval quality with LangSmith.
>     </Card>
> </CardGroup>
> 
> 

**[S5] RAG architectures / Agentic RAG，阅读包第184～225行**

> ### Agentic RAG
> 
> **Agentic Retrieval-Augmented Generation (RAG)** combines the strengths of Retrieval-Augmented Generation with agent-based reasoning. Instead of retrieving documents before answering, an agent (powered by an LLM) reasons step-by-step and decides **when** and **how** to retrieve information during the interaction.
> 
> <Tip>
> The only thing an agent needs to enable RAG behavior is access to one or more **tools** that can fetch external knowledge, such as documentation loaders, web APIs, or database queries.
> </Tip>
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Input / Question] --> B["Agent (LLM)"]
>     B --> C{Need external info?}
>     C -- Yes --> D["Search using tool(s)"]
>     D --> H{Enough to answer?}
>     H -- No --> B
>     H -- Yes --> I[Generate final answer]
>     C -- No --> I
>     I --> J[Return to user]
> 
>     %% Dark-mode friendly styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,J startend
>     class B,D,I process
>     class C,H decision
> ```
> 
> :::python
> ```python
> import requests
> from langchain.tools import tool
> from langchain.chat_models import init_chat_model
> from langchain.agents import create_agent
> 
> 
> @tool
> def fetch_url(url: str) -> str:
>     """Fetch text content from a URL"""
>     response = requests.get(url, timeout=10.0)
> 

**[S6] RAG architectures / Agentic RAG，阅读包第226～279行**

>     response.raise_for_status()
>     return response.text
> 
> system_prompt = """\
> Use fetch_url when you need to fetch information from a web-page; quote relevant snippets.
> """
> 
> agent = create_agent(
>     model="claude-sonnet-4-6",
>     tools=[fetch_url], # A tool for retrieval [!code highlight]
>     system_prompt=system_prompt,
> )
> ```
> :::
> 
> :::js
> ```typescript
> import { tool, createAgent } from "langchain";
> 
> const fetchUrl = tool(
>     (url: string) => {
>         return `Fetched content from ${url}`;
>     },
>     { name: "fetch_url", description: "Fetch text content from a URL" }
> );
> 
> const agent = createAgent({
>     model: "claude-sonnet-4-6",
>     tools: [fetchUrl],
>     systemPrompt,
> });
> ```
> :::
> 
> <Expandable title="Extended example: Agentic RAG for LangGraph's llms.txt">
> 
> This example implements an **Agentic RAG system** to assist users in querying LangGraph documentation. The agent begins by loading [llms.txt](https://llmstxt.org/), which lists available documentation URLs, and can then dynamically use a `fetch_documentation` tool to retrieve and process the relevant content based on the user’s question.
> 
> :::python
> ```python
> import requests
> from langchain.agents import create_agent
> from langchain.messages import HumanMessage
> from langchain.tools import tool
> from markdownify import markdownify
> 
> 
> ALLOWED_DOMAINS = ["https://langchain-ai.github.io/"]
> LLMS_TXT = 'https://langchain-ai.github.io/langgraph/llms.txt'
> 
> 
> @tool
> def fetch_documentation(url: str) -> str:  # [!code highlight]
>     """Fetch and convert documentation from a URL"""
> 

**[S7] RAG architectures / Agentic RAG，阅读包第280～323行**

>     if not any(url.startswith(domain) for domain in ALLOWED_DOMAINS):
>         return (
>             "Error: URL not allowed. "
>             f"Must start with one of: {', '.join(ALLOWED_DOMAINS)}"
>         )
>     response = requests.get(url, timeout=10.0)
>     response.raise_for_status()
>     return markdownify(response.text)
> 
> 
> # We will fetch the content of llms.txt, so this can
> # be done ahead of time without requiring an LLM request.
> llms_txt_content = requests.get(LLMS_TXT).text
> 
> # System prompt for the agent
> system_prompt = f"""
> You are an expert Python developer and technical assistant.
> Your primary role is to help users with questions about LangGraph and related tools.
> 
> Instructions:
> 
> 1. If a user asks a question you're unsure about—or one that likely involves API usage,
>    behavior, or configuration—you MUST use the `fetch_documentation` tool to consult the relevant docs.
> 2. When citing documentation, summarize clearly and include relevant context from the content.
> 3. Do not use any URLs outside of the allowed domain.
> 4. If a documentation fetch fails, tell the user and proceed with your best expert understanding.
> 
> You can access official documentation from the following approved sources:
> 
> {llms_txt_content}
> 
> You MUST consult the documentation to get up to date documentation
> before answering a user's question about LangGraph.
> 
> Your answers should be clear, concise, and technically accurate.
> """
> 
> tools = [fetch_documentation]
> 
> model = init_chat_model("claude-sonnet-4-6", max_tokens=32_000)
> 
> agent = create_agent(
>     model=model,
>     tools=tools,  # [!code highlight]
> 

**[S8] RAG architectures / Hybrid RAG，阅读包第427～455行**

> ### Hybrid RAG
> 
> Hybrid RAG combines characteristics of both 2-Step and Agentic RAG. It introduces intermediate steps such as query preprocessing, retrieval validation, and post-generation checks. These systems offer more flexibility than fixed pipelines while maintaining some control over execution.
> 
> Typical components include:
> 
> * **Query enhancement**: Modify the input question to improve retrieval quality. This can involve rewriting unclear queries, generating multiple variations, or expanding queries with additional context.
> * **Retrieval validation**: Evaluate whether retrieved documents are relevant and sufficient. If not, the system may refine the query and retrieve again.
> * **Answer validation**: Check the generated answer for accuracy, completeness, and alignment with source content. If needed, the system can regenerate or revise the answer.
> 
> The architecture often supports multiple iterations between these steps:
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B[Query Enhancement]
>     B --> C[Retrieve Documents]
>     C --> D{Sufficient Info?}
>     D -- No --> E[Refine Query]
>     E --> C
>     D -- Yes --> F[Generate Answer]
>     F --> G{Answer Quality OK?}
>     G -- No --> H{Try Different Approach?}
>     H -- Yes --> E
>     H -- No --> I[Return Best Answer]
>     G -- Yes --> I
>     I --> J[Return to User]
> 
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
> 

**[S9] RAG architectures / Hybrid RAG，阅读包第456～477行**

>     classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,J startend
>     class B,C,E,F,I process
>     class D,G,H decision
> ```
> 
> This architecture is suitable for:
> 
> * Applications with ambiguous or underspecified queries
> * Systems that require validation or quality control steps
> * Workflows involving multiple sources or iterative refinement
> 
> <Card
>     title="Tutorial: Agentic RAG with Self-Correction"
>     icon="robot"
>     href="/oss/langgraph/agentic-rag"
>     arrow cta="Learn more"
> >
>     An example of **Hybrid RAG** that combines agentic reasoning with retrieval and self-correction.
> </Card>
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `lg-retrieval` 第184～225行，章节：RAG architectures / Agentic RAG

> ### Agentic RAG
> 
> **Agentic Retrieval-Augmented Generation (RAG)** combines the strengths of Retrieval-Augmented Generation with agent-based reasoning. Instead of retrieving documents before answering, an agent (powered by an LLM) reasons step-by-step and decides **when** and **how** to retrieve information during the interaction.
> 
> <Tip>
> The only thing an agent needs to enable RAG behavior is access to one or more **tools** that can fetch external knowledge, such as documentation loaders, web APIs, or database queries.
> </Tip>
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Input / Question] --> B["Agent (LLM)"]
>     B --> C{Need external info?}
>     C -- Yes --> D["Search using tool(s)"]
>     D --> H{Enough to answer?}
>     H -- No --> B
>     H -- Yes --> I[Generate final answer]
>     C -- No --> I
>     I --> J[Return to user]
> 
>     %% Dark-mode friendly styling
>     classDef st

- `lg-retrieval` 第130～143行，章节：RAG architectures

> ## RAG architectures
> 
> RAG can be implemented in multiple ways, depending on your system's needs. We outline each type in the sections below.
> 
> | Architecture            | Description                                                                | Control   | Flexibility | Latency        | Example Use Case                                   |
> |-------------------------|----------------------------------------------------------------------------|-----------|-------------|----------------|----------------------------------------------------|
> | **2-Step RAG**          | Retrieval always happens before generation. Simple and predictable         | ✅ High    | ❌ Low       | ⚡ Fast         | FAQs, documentation bots                           |
> | **Agentic RAG**         | An LLM-powered agent decides *when* and *how* to retrieve during reasoning | ❌ Low     | ✅ High      | ⏳ Variable     | Research assistants with access to multiple tools  |
> | **Hybrid**              | Combines characteristics o

- `lg-retrieval` 第144～183行，章节：RAG architectures / 2-step RAG

> ### 2-step RAG
> 
> In **2-Step RAG**, the retrieval step is always executed before the generation step. This architecture is straightforward and predictable, making it suitable for many applications where the retrieval of relevant documents is a clear prerequisite for generating an answer.
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B["Retrieve Relevant Documents"]
>     B --> C["Generate Answer"]
>     C --> D[Return Answer to User]
> 
>     %% Styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,D startend
>     class B,C process
> ```
> <br/>
> <CardGroup cols={2}>
>     <Card
>         title="Tutorial: Semantic search"
>         icon="database"
>         href="/oss/langchain/knowledge-base"
>         arrow
>         cta="Learn more"
>     >
>         Bu

### n02：这个课程给出的DeepSeek训练完整模型的精确GPU数量和账单是多少？

需要判断：所给资料没有这项数值或保证；不能编造。只读到片段时说明是当前证据不足，不能声称已检查全文。

阅读来源：[Open R1 for Students](https://github.com/huggingface/course/blob/8b893f0ede6c781045692a7f892f25a0c92b4805/chapters/en/chapter12/1.mdx)

模型回答（未人工评分）：

根据本轮提供的课程内容，**没有给出训练完整 DeepSeek 模型所需的精确 GPU 数量，也没有给出对应的账单金额**。

课程中与 DeepSeek 训练相关的内容只有章节介绍，例如：

- 会讨论“What is DeepSeek R1?”以及“What are the key innovations of DeepSeek R1?”[S5]
- 会拆解“DeepSeek R1 论文”的“训练过程与架构”“结果及其意义”[S6]
- 会介绍用 TRL 实现 GRPO 训练，以及用 GRPO 对齐模型的实际案例[S7][S8]

这些只是课程目录和主题概述，未包含具体的 GPU 配置、训练成本或账单数字。

因此，不能根据本文档推断“训练完整 DeepSeek 模型用了多少 GPU、花了多少钱”。若需要这类精确数据，应查阅 DeepSeek R1 论文、官方技术报告或项目发布说明。

自动引用ID检查：`{"cited_ids": ["S5", "S6", "S7", "S8"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Open R1 for Students，阅读包第1～6行**

> # Open R1 for Students
> 
> Welcome to an exciting journey into the world of open-source AI with reinforcement learning! This chapter is designed to help students understand reinforcement learning and its role in LLMs.
> 
> We will also explore [Open R1](https://github.com/huggingface/open-r1), a groundbreaking community project that's making advanced AI accessible to everyone. Specifically, this course is to help students and learners to use and contribute to [Open R1](https://github.com/huggingface/open-r1).
> 
> 

**[S2] Open R1 for Students / What You'll Learn，阅读包第7～35行**

> ## What You'll Learn
> 
> In this chapter, we'll break down complex concepts into easy-to-understand pieces and show you how you can be part of this exciting project to make LLMs reason on complex problems. 
> 
> LLMs have shown excellent performance on many generative tasks. However, up until recently they have struggled on complex problems that require reasoning. For example, they struggle to deal with puzzles or math problems that require multiple steps of reasoning. 
> 
> Open R1 is a project that aims to make LLMs reason on complex problems. It does this by using reinforcement learning to encourage LLMs to 'think' and reason. 
> 
> In simple terms, the model is trained to generate thoughts as well as outputs, and to structure these thoughts and outputs so that they can be handled separately by the user. 
> 
> Let's take a look at an example. As we gave ourself the task of solving the following problem, we might think like this:
> 
> ```sh
> Problem: "I have 3 apples and 2 oranges. How many pieces of fruit do I have in total?"
> 
> Thought: "I need to add the number of apples and oranges to get the total number of pieces of fruit."
> 
> Answer: "5"
> ```
> 
> We can then structure this thought and answer so that they can be handled separately by the user. For reasoning tasks, LLMs can be trained to generate thoughts and answers in the following format:
> 
> ```sh
> <think>I need to add the number of apples and oranges to get the total number of pieces of fruit.</think>
> 5
> ```
> 
> As a user, we can then extract the thought and answer from the model's output and use them to solve the problem.
> 
> 

**[S3] Open R1 for Students / Why This Matters for Students，阅读包第36～43行**

> ## Why This Matters for Students
> 
> As a student, understanding Open R1 and the role of reinforcement learning in LLMs is valuable because:
> - It shows you how cutting-edge AI is developed
> - It gives you hands-on opportunities to learn and contribute
> - It helps you understand where AI technology is heading
> - It opens doors to future career opportunities in AI
> 
> 

**[S4] Open R1 for Students / Chapter Overview，阅读包第44～47行**

> ## Chapter Overview
> 
> This chapter is divided into four sections, each focusing on a different aspect of Open R1:
> 
> 

**[S5] Open R1 for Students / Chapter Overview / 1️⃣ Introduction to Reinforcement Learning and its Role in LLMs，阅读包第48～54行**

> ### 1️⃣ Introduction to Reinforcement Learning and its Role in LLMs
> We'll explore the basics of Reinforcement Learning (RL) and its role in training LLMs.
> - What is RL?
> - How is RL used in LLMs?
> - What is DeepSeek R1?
> - What are the key innovations of DeepSeek R1?
> 
> 

**[S6] Open R1 for Students / Chapter Overview / 2️⃣ Understanding the DeepSeek R1 Paper，阅读包第55～60行**

> ### 2️⃣ Understanding the DeepSeek R1 Paper
> We'll break down the research paper that inspired [Open R1](https://huggingface.co/open-r1):
> - Key innovations and breakthroughs
> - The training process and architecture
> - Results and their significance
> 
> 

**[S7] Open R1 for Students / Chapter Overview / 3️⃣ Implementing GRPO in TRL，阅读包第61～65行**

> ### 3️⃣ Implementing GRPO in TRL
> We'll get practical with code examples:
> - How to use the Transformer Reinforcement Learning (TRL) library
> - Setting up GRPO training
> 
> 

**[S8] Open R1 for Students / Chapter Overview / 4️⃣ Practical use case to align a model，阅读包第66～70行**

> ### 4️⃣ Practical use case to align a model
> We'll look at a practical use case to align a model using Open R1.
> - How to train a model using GRPO in TRL
> - Share your model on the [Hugging Face Hub](https://huggingface.co/models)
> 
> 

**[S9] Open R1 for Students / Prerequisites，阅读包第71～82行**

> ## Prerequisites
> 
> To get the most out of this chapter, it's helpful to have:
> - Solid understanding of Python programming
> - Familiarity with machine learning concepts
> - Interest in AI and language models
> 
> Don't worry if you're missing some of these – we'll explain key concepts as we go along! 🚀
> 
> > [!TIP]
> > If you don't have all the prerequisites, check out this [course](/course/chapter1/1) from units 1 to 11
> 
> 

**[S10] Open R1 for Students / How to Use This Chapter，阅读包第83～90行**

> ## How to Use This Chapter
> 
> 1. **Read Sequentially**: The sections build on each other, so it's best to read them in order
> 2. **Share Notes**: Write down key concepts and questions and discuss them within the community in [Discord](https://discord.gg/UrrTSsSyjb)
> 3. **Try the Code**: When we get to practical examples, try them yourself
> 4. **Join the Community**: Use the resources we provide to connect with other learners
> 
> Let's begin our exploration of Open R1 and discover how you can be part of making AI more accessible to everyone! 🚀
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `hf-rl` 第55～60行，章节：Open R1 for Students / Chapter Overview / 2️⃣ Understanding the DeepSeek R1 Paper

> ### 2️⃣ Understanding the DeepSeek R1 Paper
> We'll break down the research paper that inspired [Open R1](https://huggingface.co/open-r1):
> - Key innovations and breakthroughs
> - The training process and architecture
> - Results and their significance
> 
> 

- `hf-agents` 第80～88行，章节：What is an Agent? / What type of AI Models do we use for Agents?

> ## What type of AI Models do we use for Agents?
> 
> The most common AI model found in Agents is an LLM (Large Language Model), which  takes **Text** as an input and outputs **Text** as well.
> 
> Well known examples are **GPT-4** from **OpenAI**, **Llama** from **Meta**, **Gemini** from **Google**, etc. These models have been trained on a vast amount of text and are able to generalize well. We will learn more about LLMs in the [next section](what-are-llms).
> 
> > [!TIP]
> > It's also possible to use models that accept other inputs as the Agent's core model. For example, a Vision Language Model (VLM), which is like an LLM but also understands images as input. We'll focus on LLMs for now and will discuss other options later.
> 
> 

- `lg-retrieval` 第144～183行，章节：RAG architectures / 2-step RAG

> ### 2-step RAG
> 
> In **2-Step RAG**, the retrieval step is always executed before the generation step. This architecture is straightforward and predictable, making it suitable for many applications where the retrieval of relevant documents is a clear prerequisite for generating an answer.
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B["Retrieve Relevant Documents"]
>     B --> C["Generate Answer"]
>     C --> D[Return Answer to User]
> 
>     %% Styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,D startend
>     class B,C process
> ```
> <br/>
> <CardGroup cols={2}>
>     <Card
>         title="Tutorial: Semantic search"
>         icon="database"
>         href="/oss/langchain/knowledge-base"
>         arrow
>         cta="Learn more"
>     >
>         Bu

### n03：使用pi以后，我这个项目的开发效率必然提高百分之多少？

需要判断：所给资料没有这项数值或保证；不能编造。只读到片段时说明是当前证据不足，不能声称已检查全文。

阅读来源：[Pi](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/README.md), [@earendil-works/pi-agent-core](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md)

模型回答（未人工评分）：

无法给出一个“必然提高百分之多少”的数字。**本轮提供的文档中没有任何关于开发效率提升幅度的量化数据、基准测试或用户效果统计**，因此不能据此推出一个百分比；声称“必然提高 X%”会是没有原文依据的推断。

文档可以直接支持的只是 Pi 的定位与能力：

- Pi 被描述为一个“minimal, extensible agent harness”，强调按你的工作流去定制，而不是反过来适应它；可用的定制项包括 extensions、skills、prompt templates、themes，并可打包分享[S2]。
- 它支持交互式使用、print/JSON 模式自动化、RPC 控制，以及 TypeScript SDK 构建应用[S2]。
- 它自带“powerful defaults”，但明确**跳过** sub-agents 和 plan mode 这类功能；需要的话可以自己构建或安装包[S2]。

这些都是功能与使用方式的描述，**不是效率提升的度量**。效率是否提高、提高多少，会取决于你的项目类型、任务结构、你对 Pi 的配置程度，以及你是否需要它默认没有的功能；文档本身也没有给出适用于所有项目的保证。

补充解释：如果你想要一个可比较的数字，较可靠的做法是先在你的项目里选一组代表性任务，记录使用前后的完成时间、返工次数或测试通过率等指标，再做对照；这属于额外的方法建议，不是文档作者的结论。

自动引用ID检查：`{"cited_ids": ["S2"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Source: Pi，阅读包第3～16行**

> # Source: Pi
> 
> <p align="center">
>   <a href="https://pi.dev">
>     <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
>   </a>
> </p>
> <p align="center">
>   <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
>   <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
> </p>
> 
> > New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).
> 
> 

**[S2] Pi，阅读包第17～26行**

> # Pi
> 
> Pi is a minimal, extensible agent harness that you can make your own.
> 
> Adapt Pi to your workflows, not the other way around. Customize Pi with [extensions](packages/coding-agent/docs/extensions.md), [skills](packages/coding-agent/docs/skills.md), [prompt templates](packages/coding-agent/docs/prompt-templates.md), and [themes](packages/coding-agent/docs/themes.md). Bundle them as [Pi packages](packages/coding-agent/docs/packages.md) and share via npm or git.
> 
> Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way.
> 
> Use Pi [interactively](packages/coding-agent/docs/usage.md), automate it in [print or JSON mode](packages/coding-agent/docs/cli.md), control it over [RPC](packages/coding-agent/docs/rpc.md), or build apps with the [Pi TypeScript SDK](packages/coding-agent/docs/sdk.md). See [OpenClaw](https://github.com/OpenClaw/OpenClaw) for a real-world integration.
> 
> 

**[S3] Pi / Getting started，阅读包第27～59行**

> ## Getting started
> 
> Install the command-line interface:
> 
> ```bash
> curl -fsSL https://pi.dev/install.sh | sh
> ```
> 
> On Windows:
> 
> ```shell
> powershell -c "irm https://pi.dev/install.ps1 | iex"
> ```
> 
> The installer pins all dependencies and updates Pi with `pi update`. Alternatively, install directly with npm, which does not pin transitive dependencies:
> 
> ```bash
> npm install -g --ignore-scripts @earendil-works/pi-coding-agent
> ```
> 
> Pi requires Node.js 22.19 or newer. The macOS, Linux, and Windows installers can install it if needed. Pi does not require dependency lifecycle scripts for a normal npm installation.
> 
> Start Pi in the directory where you want it to work:
> 
> ```bash
> cd /path/to/project
> pi
> ```
> 
> For a built-in AI provider, run `/login` inside Pi to connect a subscription or API key. Then give Pi a task.
> 
> See the [documentation](https://pi.dev/docs/latest) for full setup and usage instructions, or [visit pi.dev](https://pi.dev) for demos.
> 
> 

**[S4] Pi / Run with Nix，阅读包第60～75行**

> ## Run with Nix
> 
> ```bash
> nix run github:earendil-works/pi/stable
> ```
> 
> `stable` points at the latest release. Install it with `nix profile add github:earendil-works/pi/stable` and update with `nix profile upgrade pi`. Use a release tag such as `github:earendil-works/pi/v1.0.0` to pin a version, or `github:earendil-works/pi` for unreleased changes on `main`. Nix builds Pi from source.
> 
> Supports ARM64 and x86-64 on Linux and macOS. Use `nix build .` or `nix run .` to build or run your checkout.
> 
> Nix builds are offline, so the bundled model data comes from a pi.dev model catalog revision pinned in `nix/model-catalog.json`. At runtime, Pi still overlays newer catalog data from pi.dev as usual. The Nix workflow replaces the pin on `main` when it no longer matches the checkout, for example after a provider is added or gains a new model type. To refresh it by hand:
> 
> ```bash
> npm run update:model-catalog-pin
> ```
> 
> 

**[S5] Pi / Packages，阅读包第76～91行**

> ## Packages
> 
> This monorepo contains the Pi CLI and its supporting libraries.
> 
> | Package | Description |
> |---------|-------------|
> | **[@earendil-works/chord](packages/chord)** | Typed host runtime for hot-reloadable plugins, contracts, replicated state, and RPC over JSON links |
> | **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
> | **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
> | **[@earendil-works/pi-durable](packages/durable)** | Durable conversation, task, and document runtime |
> | **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
> | **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
> | **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
> 
> For Slack/chat automation and workflows see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).
> 
> 

**[S6] Pi / Permissions & Containerization，阅读包第92～101行**

> ## Permissions & Containerization
> 
> Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.
> 
> If you need stronger boundaries, containerize or sandbox Pi. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:
> 
> - **Gondolin extension**: keep `pi` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
> - **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
> - **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.
> 
> 

**[S7] Pi / Contributing，阅读包第102～105行**

> ## Contributing
> 
> See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).  Longer term plans for Pi can also be found in [RFCs](https://rfc.earendil.com/keyword/pi/).
> 
> 

**[S8] Pi / Development，阅读包第106～116行**

> ## Development
> 
> ```bash
> npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
> npm run build         # Refresh model data, then build all packages
> npm run build:offline # Rebuild using existing model data without network access
> npm run check         # Lint, format, and type check
> ./test.sh            # Run tests (skips LLM-dependent tests without API keys)
> ./pi-test.sh         # Run pi from sources (can be run from any directory)
> ```
> 
> 

**[S9] Pi / Development / Using local packages outside the monorepo，阅读包第117～158行**

> ### Using local packages outside the monorepo
> 
> Build every public package into one coherent local artifact set:
> 
> ```bash
> npm run pack:packages -- --out .artifacts/pi-packages
> ```
> 
> This refreshes model data before building `pi-ai`. To avoid network access when
> model data is already hydrated, pass `--offline-model-data`.
> 
> Then configure an external project to consume one package and resolve all of
> its Pi dependencies from the same artifact set. npm is the default:
> 
> ```bash
> node scripts/use-local-packages.mjs \
>   --manifest .artifacts/pi-packages/manifest.json \
>   --consumer ../my-project \
>   --package @earendil-works/pi-durable \
>   --package @earendil-works/pi-agent-core
> cd ../my-project
> npm install --ignore-scripts
> ```
> 
> For a pnpm project, point `--consumer` at the workspace root:
> 
> ```bash
> node scripts/use-local-packages.mjs \
>   --manifest .artifacts/pi-packages/manifest.json \
>   --consumer ../my-project \
>   --package @earendil-works/pi-agent-core \
>   --package-manager pnpm
> cd ../my-project
> pnpm install --ignore-scripts
> ```
> 
> Repeat `--package` for each direct dependency. The command updates the
> consumer's `package.json` with content-addressed local `file:` references. It
> writes transitive overrides to `package.json` for npm or `pnpm-workspace.yaml`
> for pnpm. Keep the artifact directory available while installing or updating
> the consumer. Re-run both commands after changing Pi source.
> 
> 

**[S10] Pi / Building standalone binaries from release source，阅读包第159～171行**

> ## Building standalone binaries from release source
> 
> GitHub releases include a versioned source archive covered by the release's `SHA256SUMS` file. Extract it and run the same build script used for the official standalone binaries:
> 
> ```bash
> VERSION="<release-version>"
> tar -xzf "pi-${VERSION}-source.tar.gz"
> cd "pi-${VERSION}"
> ./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
> ```
> 
> The archive includes release model data and native prebuilds. `--offline-model-data` uses that model data without refreshing provider catalogs. The script installs dependencies and builds the executable with its runtime assets; pass `--skip-install` if dependencies are already provided.
> 
> 

**[S11] Pi / Supply-chain hardening，阅读包第172～185行**

> ## Supply-chain hardening
> 
> We treat npm dependency changes as reviewed code changes.
> 
> - Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
> - `.npmrc` sets `save-exact=true` and `min-release-age=2` to avoid same-day dependency releases during npm resolution.
> - `package-lock.json` is the dependency ground truth. Pre-commit blocks accidental lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1` is set.
> - `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and the generated coding-agent install lock.
> - The pi.dev installer installs from `packages/coding-agent/install-lock/`, generated from the root lockfile, to pin transitive deps. The npm package does not pin transitive deps.
> - Local release smoke tests and npm publication use the same tarball packer; npm publishes the validated tarballs rather than repacking workspace directories.
> - Local release installs, documented npm installs, and `pi update --self` use `--ignore-scripts` where supported.
> - CI installs with `npm ci --ignore-scripts`, and a scheduled GitHub workflow runs `npm audit --omit=dev` plus `npm audit signatures --omit=dev`.
> - Install lock generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.
> 
> 

**[S12] Pi / Share your OSS coding agent sessions，阅读包第186～201行**

> ## Share your OSS coding agent sessions
> 
> If you use Pi or other coding agents for open source work, please share your sessions.
> 
> Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.
> 
> For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).
> 
> To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.
> 
> You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.
> 
> I regularly publish my own `pi-mono` work sessions here:
> 
> - [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)
> 
> 

**[S13] Pi / License，阅读包第202～212行**

> ## License
> 
> MIT
> 
> <p align="center">
>   <a href="https://pi.dev">pi.dev</a> domain graciously donated by
>   <br /><br />
>   <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
> </p>
> 
> 
> 

**[S14] Source: @earendil-works/pi-agent-core，阅读包第213～214行**

> # Source: @earendil-works/pi-agent-core
> 
> 

**[S15] @earendil-works/pi-agent-core，阅读包第215～218行**

> # @earendil-works/pi-agent-core
> 
> Stateful agent with tool execution and event streaming. Built on `@earendil-works/pi-ai`.
> 
> 

**[S16] @earendil-works/pi-agent-core / Installation，阅读包第219～224行**

> ## Installation
> 
> ```bash
> npm install @earendil-works/pi-agent-core
> ```
> 
> 

**[S17] @earendil-works/pi-agent-core / Quick Start，阅读包第225～254行**

> ## Quick Start
> 
> ```typescript
> import { Agent } from "@earendil-works/pi-agent-core";
> import { createModels } from "@earendil-works/pi-ai";
> import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
> 
> const models = createModels();
> models.setProvider(anthropicProvider());
> const model = models.getModel("anthropic", "claude-sonnet-4-6");
> if (!model) throw new Error("Model not found");
> 
> const agent = new Agent({
>   initialState: {
>     systemPrompt: "You are a helpful assistant.",
>     model,
>   },
>   streamFn: models.streamSimple.bind(models),
> });
> 
> agent.subscribe((event) => {
>   if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
>     // Stream just the new text chunk
>     process.stdout.write(event.assistantMessageEvent.delta);
>   }
> });
> 
> await agent.prompt("Hello!");
> ```
> 
> 

**[S18] @earendil-works/pi-agent-core / Core Concepts，阅读包第255～256行**

> ## Core Concepts
> 
> 

**[S19] @earendil-works/pi-agent-core / Methods，阅读包第528～529行**

> ## Methods
> 
> 

**[S20] @earendil-works/pi-agent-core / Methods / Session and Thinking Budgets，阅读包第567～579行**

> ### Session and Thinking Budgets
> 
> ```typescript
> agent.sessionId = "session-123";
> 
> agent.thinkingBudgets = {
>   minimal: 128,
>   low: 512,
>   medium: 1024,
>   high: 2048,
> };
> ```
> 
> 

**[S21] @earendil-works/pi-agent-core / License，阅读包第776～778行**

> ## License
> 
> MIT
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `pi-overview` 第56～71行，章节：Pi / Run with Nix

> ## Run with Nix
> 
> ```bash
> nix run github:earendil-works/pi/stable
> ```
> 
> `stable` points at the latest release. Install it with `nix profile add github:earendil-works/pi/stable` and update with `nix profile upgrade pi`. Use a release tag such as `github:earendil-works/pi/v1.0.0` to pin a version, or `github:earendil-works/pi` for unreleased changes on `main`. Nix builds Pi from source.
> 
> Supports ARM64 and x86-64 on Linux and macOS. Use `nix build .` or `nix run .` to build or run your checkout.
> 
> Nix builds are offline, so the bundled model data comes from a pi.dev model catalog revision pinned in `nix/model-catalog.json`. At runtime, Pi still overlays newer catalog data from pi.dev as usual. The Nix workflow replaces the pin on `main` when it no longer matches the checkout, for example after a provider is added or gains a new model type. To refresh it by hand:
> 
> ```bash
> npm run update:model-catalog-pin
> ```
> 
> 

- `pi-overview` 第23～55行，章节：Pi / Getting started

> ## Getting started
> 
> Install the command-line interface:
> 
> ```bash
> curl -fsSL https://pi.dev/install.sh | sh
> ```
> 
> On Windows:
> 
> ```shell
> powershell -c "irm https://pi.dev/install.ps1 | iex"
> ```
> 
> The installer pins all dependencies and updates Pi with `pi update`. Alternatively, install directly with npm, which does not pin transitive dependencies:
> 
> ```bash
> npm install -g --ignore-scripts @earendil-works/pi-coding-agent
> ```
> 
> Pi requires Node.js 22.19 or newer. The macOS, Linux, and Windows installers can install it if needed. Pi does not require dependency lifecycle scripts for a normal npm installation.
> 
> Start Pi in the directory where you want it to work:
> 
> ```bash
> cd /path/to/project
> pi
> ```
> 
> For a built-in AI provider, run `/login` inside Pi to connect a subscription or API key. Then give Pi a task.
> 
> See the [documentation](https://pi.dev/docs/latest) for full setup and usage instructions, or [visit pi.dev](https://pi.dev) for demos.
> 
> 

- `pi-overview` 第113～154行，章节：Pi / Development / Using local packages outside the monorepo

> ### Using local packages outside the monorepo
> 
> Build every public package into one coherent local artifact set:
> 
> ```bash
> npm run pack:packages -- --out .artifacts/pi-packages
> ```
> 
> This refreshes model data before building `pi-ai`. To avoid network access when
> model data is already hydrated, pass `--offline-model-data`.
> 
> Then configure an external project to consume one package and resolve all of
> its Pi dependencies from the same artifact set. npm is the default:
> 
> ```bash
> node scripts/use-local-packages.mjs \
>   --manifest .artifacts/pi-packages/manifest.json \
>   --consumer ../my-project \
>   --package @earendil-works/pi-durable \
>   --package @earendil-works/pi-agent-core
> cd ../my-project
> npm install --ignore-scripts
> ```
> 
> For a pnpm project, point `--consumer` at the workspace root:
> 
> ```bash
> node scripts/use-local-packages.mjs \
>   --manifest .artifacts/pi-packages/manifest.json \
>   --consumer ../my-project \
>   --package @earendil-works/pi-agent-core \
>   --package-manager pnpm
> cd ../my-pro

### u01：完整的RAG应该包括哪些部分

需要判断：检查是否区分基础流水线与生产要求；出处未涵盖的权限、评测等应标为补充解释。

阅读来源：[Retrieval](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/deepagents/retrieval.mdx), [Agentic Retrieval Augmented Generation (RAG)](https://github.com/huggingface/agents-course/blob/3c469e773ec04e5f338b727ff20e3a6ea823ff81/units/en/unit3/agentic-rag/agentic-rag.mdx)

模型回答（未人工评分）：

根据本轮片段，可以把它分成“基础组件 + 生成链路 + 增强/控制环节”三层来理解。

## 1. 基础组件：知识库怎么建、怎么查

文档的 “Building blocks” 列出了 5 个构建块[S1]：

| 组件 | 作用 |
|---|---|
| **Document loaders（文档加载器）** | 从 Google Drive、Slack、Notion 等外部来源摄取数据，返回标准化的 `Document` 对象[S1] |
| **Text splitters（文本分割器）** | 把大文档切成可单独检索、且能放进模型上下文窗口的小块[S1] |
| **Embedding models（嵌入模型）** | 把文本转成数值向量，让语义相近的文本在向量空间中接近[S1] |
| **Vector stores（向量存储）** | 专门存储和搜索嵌入的数据库[S1] |
| **Retrievers（检索器）** | 给定非结构化查询、返回文档的接口[S1] |

这五项对应的是“文档入库 → 切块 → 向量化 → 存储 → 查询”的基础链路。

## 2. 最小完整链路：检索后生成

**2-Step RAG** 给出了最小闭环[S3]：

> 用户问题 → 检索相关文档 → 生成答案 → 返回给用户[S3]

它的特点是检索**总是发生在生成之前**，简单、可预测，适合 FAQ、文档机器人等场景[S2][S3]。文档也说明，RAG 的核心作用是“找到并检索你数据中的相关信息，再转交给 LLM”[S9]，这补上了基础组件之外的“生成”环节。

所以如果只问“完整跑通一次 RAG”，至少需要：**加载/切分/嵌入/存储/检索 + LLM 生成**。

## 3. 更完整的形态：还要有决策、工具与验证

当系统不满足于固定“先检索再生成”，文档给出了两类增强架构：

### Agentic RAG
- 由 LLM 驱动的 agent 逐步推理，决定**何时**、**如何**检索[S4]。
- agent 要具备 RAG 行为，关键是能访问一个或多个可获取外部知识的**工具**，例如文档加载器、Web API、数据库查询[S4]。
- 流程中包含“是否需要外部信息”“检索结果是否足够回答”的判断与循环[S4]。
- 文档示例里还把 Web 搜索、天气、模型下载统计等作为工具一起接入[S10]。

### Hybrid RAG
在 2-Step 与 Agentic 之间加入中间控制步骤[S6]：
- **Query enhancement（查询增强）**：改写不清楚的问题、生成多个变体、补充上下文[S6]。
- **Retrieval validation（检索验证）**：判断检索到的文档是否相关、充分；不够就细化查询再检索[S6]。
- **Answer validation（答案验证）**：检查答案的准确性、完整性、与源内容的一致性；必要时重新生成或修订[S6]。
- 这些步骤之间可以多次迭代[S6]。

## 4. 选型时要明确的维度

文档用三个维度比较架构[S2]：
- **控制力**：2-Step 高，Agentic 低，Hybrid 中等[S2]
- **灵活性**：2-Step 低，Agentic 高，Hybrid 中等[S2]
- **延迟**：2-Step 通常更快、更可预测；Agentic 和 Hybrid 可变[S2]。不过文档也提醒：这种可预测性假设 LLM 推理时间是主导因素，实际延迟还受检索步骤的 API 响应、网络延迟、数据库查询等影响[S2]。

## 5. 文档片段中提到的评估相关部分

2-Step RAG 的教程卡片提到可以测量**答案正确性、相关性、groundedness（有据可依程度）和检索质量**[S3]。这属于质量保障的一环，但片段没有展开具体评估组件。

## 需要说明的边界

本轮是部分文档（`partial_document`），以上只覆盖所给片段。片段没有系统性地列出“生产级 RAG 的完整清单”，因此不能据此断言全文没有其他组成部分。

**补充解释（非作者观点）**：在生产环境中，通常还会考虑数据更新与增量索引、权限/租户过滤、缓存、可观测性与日志、离线评测集、成本控制等；但这些在本轮片段中没有对应依据，不能算作文档所述内容。

**一句话总结**：按本文档，完整 RAG 至少是“加载器 → 分割器 → 嵌入模型 → 向量库 → 检索器 → LLM 生成”[S1][S3]；更完整的形态再叠加 agent 的工具决策[S4] 或查询增强、检索验证、答案验证等控制环节[S6]。

自动引用ID检查：`{"cited_ids": ["S1", "S3", "S2", "S9", "S4", "S10", "S6"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Source: Retrieval / Building a knowledge base / Building blocks，阅读包第80～133行**

> ### Building blocks
> 
> <Columns cols={2}>
>     <Card
>         title="Document loaders"
>         icon="file-import"
>         href="/oss/integrations/document_loaders"
>         arrow cta="Learn more"
>     >
>         Ingest data from external sources (Google Drive, Slack, Notion, etc.), returning standardized @[`Document`] objects.
>     </Card>
> 
>     :::python
>     <Card
>         title="Text splitters"
>         icon="scissors"
>         href="/oss/integrations/splitters"
>         arrow
>         cta="Learn more"
>     >
>         Break large docs into smaller chunks that will be retrievable individually and fit within a model's context window.
>     </Card>
>     :::
>     <Card
>         title="Embedding models"
>         icon="sitemap"
>         href="/oss/integrations/embeddings"
>         arrow
>         cta="Learn more"
>     >
>         An embedding model turns text into a vector of numbers so that texts with similar meaning land close together in that vector space.
>     </Card>
> 
>     <Card
>         title="Vector stores"
>         icon="database"
>         href="/oss/integrations/vectorstores/"
>         arrow
>         cta="Learn more"
>     >
>         Specialized databases for storing and searching embeddings.
>     </Card>
> 
>     <Card
>         title="Retrievers"
>         icon="binoculars"
>         href="/oss/integrations/retrievers/"
>         arrow
>         cta="Learn more"
>     >
>         A retriever is an interface that returns documents given an unstructured query.
>     </Card>
> </Columns>
> 
> 

**[S2] Source: Retrieval / RAG architectures，阅读包第134～147行**

> ## RAG architectures
> 
> RAG can be implemented in multiple ways, depending on your system's needs. We outline each type in the sections below.
> 
> | Architecture            | Description                                                                | Control   | Flexibility | Latency        | Example Use Case                                   |
> |-------------------------|----------------------------------------------------------------------------|-----------|-------------|----------------|----------------------------------------------------|
> | **2-Step RAG**          | Retrieval always happens before generation. Simple and predictable         | ✅ High    | ❌ Low       | ⚡ Fast         | FAQs, documentation bots                           |
> | **Agentic RAG**         | An LLM-powered agent decides *when* and *how* to retrieve during reasoning | ❌ Low     | ✅ High      | ⏳ Variable     | Research assistants with access to multiple tools  |
> | **Hybrid**              | Combines characteristics of both approaches with validation steps          | ⚖️ Medium | ⚖️ Medium   | ⏳ Variable     | Domain-specific Q&A with quality validation        |
> 
> <Info>
> **Latency**: Latency is generally more **predictable** in **2-Step RAG**, as the maximum number of LLM calls is known and capped. This predictability assumes that LLM inference time is the dominant factor. However, real-world latency may also be affected by the performance of retrieval steps, such as API response times, network delays, or database queries, which can vary based on the tools and infrastructure in use.
> </Info>
> 
> 

**[S3] Source: Retrieval / RAG architectures / 2-step RAG，阅读包第148～187行**

> ### 2-step RAG
> 
> In **2-Step RAG**, the retrieval step is always executed before the generation step. This architecture is straightforward and predictable, making it suitable for many applications where the retrieval of relevant documents is a clear prerequisite for generating an answer.
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B["Retrieve Relevant Documents"]
>     B --> C["Generate Answer"]
>     C --> D[Return Answer to User]
> 
>     %% Styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,D startend
>     class B,C process
> ```
> <br/>
> <CardGroup cols={2}>
>     <Card
>         title="Tutorial: Semantic search"
>         icon="database"
>         href="/oss/langchain/knowledge-base"
>         arrow
>         cta="Learn more"
>     >
>         Build a searchable knowledge base with document loaders, embeddings, and vector stores, then run a minimal retrieve-then-generate RAG workflow on top of it.
>     </Card>
>     <Card
>         title="Tutorial: Evaluate a RAG application"
>         icon="clipboard-check"
>         href="/langsmith/evaluate-rag-tutorial"
>         arrow
>         cta="Learn more"
>     >
>         Build a simple retrieve-then-generate RAG app and measure answer correctness, relevance, groundedness, and retrieval quality with LangSmith.
>     </Card>
> </CardGroup>
> 
> 

**[S4] Source: Retrieval / RAG architectures / Agentic RAG，阅读包第188～229行**

> ### Agentic RAG
> 
> **Agentic Retrieval-Augmented Generation (RAG)** combines the strengths of Retrieval-Augmented Generation with agent-based reasoning. Instead of retrieving documents before answering, an agent (powered by an LLM) reasons step-by-step and decides **when** and **how** to retrieve information during the interaction.
> 
> <Tip>
> The only thing an agent needs to enable RAG behavior is access to one or more **tools** that can fetch external knowledge, such as documentation loaders, web APIs, or database queries.
> </Tip>
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Input / Question] --> B["Agent (LLM)"]
>     B --> C{Need external info?}
>     C -- Yes --> D["Search using tool(s)"]
>     D --> H{Enough to answer?}
>     H -- No --> B
>     H -- Yes --> I[Generate final answer]
>     C -- No --> I
>     I --> J[Return to user]
> 
>     %% Dark-mode friendly styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,J startend
>     class B,D,I process
>     class C,H decision
> ```
> 
> :::python
> ```python
> import requests
> from langchain.tools import tool
> from langchain.chat_models import init_chat_model
> from langchain.agents import create_agent
> 
> 
> @tool
> def fetch_url(url: str) -> str:
>     """Fetch text content from a URL"""
>     response = requests.get(url, timeout=10.0)
> 

**[S5] Source: Retrieval / RAG architectures / Agentic RAG，阅读包第382～430行**

> 1. If a user asks a question you're unsure about—or one that likely involves API usage,
>    behavior, or configuration—you MUST use the \`fetch_documentation\` tool to consult the relevant docs.
> 2. When citing documentation, summarize clearly and include relevant context from the content.
> 3. Do not use any URLs outside of the allowed domain.
> 4. If a documentation fetch fails, tell the user and proceed with your best expert understanding.
> 
> You can access official documentation from the following approved sources:
> 
> ${llmsTxtContent}
> 
> You MUST consult the documentation to get up to date documentation
> before answering a user's question about LangGraph.
> 
> Your answers should be clear, concise, and technically accurate.
> `;
> 
> const tools = [fetchDocumentation];
> 
> const agent = createAgent({
>   model: "claude-sonnet-4-6"
>   tools,  // [!code highlight]
>   systemPrompt,  // [!code highlight]
>   name: "Agentic RAG",
> });
> 
> const response = await agent.invoke({
>   messages: [
>     new HumanMessage(
>       "Write a short example of a langgraph agent using the " +
>       "prebuilt create react agent. the agent should be able " +
>       "to look up stock pricing information."
>     ),
>   ],
> });
> 
> console.log(response.messages.at(-1)?.content);
> ```
> :::
> </Expandable>
> 
> <Card
>     title="Tutorial: RAG with Deep Agents"
>     icon="robot"
>     href="/oss/deepagents/rag"
>     arrow cta="Learn more"
> >
>     Build a documentation Q&A agent that retrieves relevant chunks at query time, offloads them to the filesystem, and delegates analysis to subagents.
> </Card>
> 
> 

**[S6] Source: Retrieval / RAG architectures / Hybrid RAG，阅读包第431～459行**

> ### Hybrid RAG
> 
> Hybrid RAG combines characteristics of both 2-Step and Agentic RAG. It introduces intermediate steps such as query preprocessing, retrieval validation, and post-generation checks. These systems offer more flexibility than fixed pipelines while maintaining some control over execution.
> 
> Typical components include:
> 
> * **Query enhancement**: Modify the input question to improve retrieval quality. This can involve rewriting unclear queries, generating multiple variations, or expanding queries with additional context.
> * **Retrieval validation**: Evaluate whether retrieved documents are relevant and sufficient. If not, the system may refine the query and retrieve again.
> * **Answer validation**: Check the generated answer for accuracy, completeness, and alignment with source content. If needed, the system can regenerate or revise the answer.
> 
> The architecture often supports multiple iterations between these steps:
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B[Query Enhancement]
>     B --> C[Retrieve Documents]
>     C --> D{Sufficient Info?}
>     D -- No --> E[Refine Query]
>     E --> C
>     D -- Yes --> F[Generate Answer]
>     F --> G{Answer Quality OK?}
>     G -- No --> H{Try Different Approach?}
>     H -- Yes --> E
>     H -- No --> I[Return Best Answer]
>     G -- Yes --> I
>     I --> J[Return to User]
> 
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
> 

**[S7] Source: Retrieval / RAG architectures / Hybrid RAG，阅读包第460～483行**

>     classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,J startend
>     class B,C,E,F,I process
>     class D,G,H decision
> ```
> 
> This architecture is suitable for:
> 
> * Applications with ambiguous or underspecified queries
> * Systems that require validation or quality control steps
> * Workflows involving multiple sources or iterative refinement
> 
> <Card
>     title="Tutorial: Agentic RAG with Self-Correction"
>     icon="robot"
>     href="/oss/langgraph/agentic-rag"
>     arrow cta="Learn more"
> >
>     An example of **Hybrid RAG** that combines agentic reasoning with retrieval and self-correction.
> </Card>
> 
> 
> 

**[S8] Source: Agentic Retrieval Augmented Generation (RAG)，阅读包第484～485行**

> # Source: Agentic Retrieval Augmented Generation (RAG)
> 
> 

**[S9] Agentic Retrieval Augmented Generation (RAG)，阅读包第486～512行**

> # Agentic Retrieval Augmented Generation (RAG)
> 
> In this unit, we'll be taking a look at how we can use Agentic RAG to help Alfred prepare for the amazing gala.
> 
> > [!TIP]
> > We know we've already discussed Retrieval Augmented Generation (RAG) and agentic RAG in the previous unit, so feel free to skip ahead if you're already familiar with the concepts.
> 
> LLMs are trained on enormous bodies of data to learn general knowledge.
> However, the world knowledge model of LLMs may not always be relevant and up-to-date information.
> **RAG solves this problem by finding and retrieving relevant information from your data and forwarding that to the LLM.**
> 
> ![RAG](https://huggingface.co/datasets/agents-course/course-images/resolve/main/en/unit2/llama-index/rag.png)
> 
> Now, think about how Alfred works:
> 
> 1. We've asked Alfred to help plan a gala
> 2. Alfred needs to find the latest news and weather information
> 3. Alfred needs to structure and search the guest information
> 
> Just as Alfred needs to search through your household information to be helpful, any agent needs a way to find and understand relevant data.
> **Agentic RAG is a powerful way to use agents to answer questions about your data.** We can pass various tools to Alfred to help him answer questions.
> However, instead of answering the question on top of documents automatically, Alfred can decide to use any other tool or flow to answer the question.
> 
> ![Agentic RAG](https://huggingface.co/datasets/agents-course/course-images/resolve/main/en/unit2/llama-index/agentic-rag.png)
> 
> Let's start **building our agentic RAG workflow!**  
> 
> 

**[S10] Agentic Retrieval Augmented Generation (RAG)，阅读包第513～513行**

> First, we'll create a RAG tool to retrieve up-to-date details about the invitees. Next, we'll develop tools for web search, weather updates, and Hugging Face Hub model download statistics. Finally, we'll integrate everything to bring our agentic RAG agent to life!  
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `lg-retrieval` 第144～183行，章节：RAG architectures / 2-step RAG

> ### 2-step RAG
> 
> In **2-Step RAG**, the retrieval step is always executed before the generation step. This architecture is straightforward and predictable, making it suitable for many applications where the retrieval of relevant documents is a clear prerequisite for generating an answer.
> 
> ```mermaid actions={true}
> %%{init: {'flowchart': {'nodeSpacing': 12, 'rankSpacing': 18, 'padding': 4}, 'themeVariables': {'fontSize': '12px'}}}%%
> graph TB
>     A[User Question] --> B["Retrieve Relevant Documents"]
>     B --> C["Generate Answer"]
>     C --> D[Return Answer to User]
> 
>     %% Styling
>     classDef startend fill:#F6FFDB,stroke:#6E8900,stroke-width:2px,color:#2E3900
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,D startend
>     class B,C process
> ```
> <br/>
> <CardGroup cols={2}>
>     <Card
>         title="Tutorial: Semantic search"
>         icon="database"
>         href="/oss/langchain/knowledge-base"
>         arrow
>         cta="Learn more"
>     >
>         Bu

- `lg-retrieval` 第130～143行，章节：RAG architectures

> ## RAG architectures
> 
> RAG can be implemented in multiple ways, depending on your system's needs. We outline each type in the sections below.
> 
> | Architecture            | Description                                                                | Control   | Flexibility | Latency        | Example Use Case                                   |
> |-------------------------|----------------------------------------------------------------------------|-----------|-------------|----------------|----------------------------------------------------|
> | **2-Step RAG**          | Retrieval always happens before generation. Simple and predictable         | ✅ High    | ❌ Low       | ⚡ Fast         | FAQs, documentation bots                           |
> | **Agentic RAG**         | An LLM-powered agent decides *when* and *how* to retrieve during reasoning | ❌ Low     | ✅ High      | ⏳ Variable     | Research assistants with access to multiple tools  |
> | **Hybrid**              | Combines characteristics o

- `lg-retrieval` 第456～477行，章节：RAG architectures / Hybrid RAG

>     classDef decision fill:#FDF3FF,stroke:#7E65AE,stroke-width:2px,color:#504B5F
>     classDef process fill:#E5F4FF,stroke:#006DDD,stroke-width:1.5px,color:#030710
> 
>     class A,J startend
>     class B,C,E,F,I process
>     class D,G,H decision
> ```
> 
> This architecture is suitable for:
> 
> * Applications with ambiguous or underspecified queries
> * Systems that require validation or quality control steps
> * Workflows involving multiple sources or iterative refinement
> 
> <Card
>     title="Tutorial: Agentic RAG with Self-Correction"
>     icon="robot"
>     href="/oss/langgraph/agentic-rag"
>     arrow cta="Learn more"
> >
>     An example of **Hybrid RAG** that combines agentic reasoning with retrieval and self-correction.
> </Card>
> 

### u02：怎么保证agent结构化输出

需要判断：检查是否区分格式/Schema约束与语义正确，说明能力条件、校验、失败处理，避免保证永不出错。

阅读来源：[Structured output](https://github.com/langchain-ai/docs/blob/ab4cb3be7130e05df5b642cd5d3a8104befab235/src/oss/langchain/structured-output.mdx)

模型回答（未人工评分）：

## 核心机制

在 `create_agent` 上设置结构化输出 schema，agent 会捕获、验证模型产出的数据，并把它放进最终 state 的固定字段（Python 用 `structured_response`，JS 用 `structuredResponse`）[S2][S3]。

## 一、选择策略：决定“保证”的强度

文档提供两种策略 [S1]：

| 策略 | 做法 | 可靠性 |
|---|---|---|
| `ProviderStrategy` | 使用模型供应商原生的结构化输出（OpenAI、Anthropic、xAI、Gemini 等） | 文档称这是“最可靠的方法（when available）”，由供应商强制执行 schema，提供高可靠性和严格校验 [S4][S8] |
| `ToolStrategy` | 借助一次额外的工具调用来生成结构化输出 [S3] | 所有模型都能用，属于兜底方案 |

直接传入 schema 类型时，LangChain 会自动选择：模型支持原生结构化输出就用 `ProviderStrategy`，否则用 `ToolStrategy` [S1]；JS 侧默认用 tool calling，模型支持原生时改用原生 [S3]。

**最直接的控制方式**：显式用 `providerStrategy(schema)` / `toolStrategy(schema)` 包一层，不依赖自动判断 [S3]。

## 二、让输出更“严格”的几个要点

1. **开启 `strict`**：`ProviderStrategy(schema, strict=True)` 可启用严格 schema 遵循，OpenAI、xAI 等支持；默认 `None`（关闭），且需要 `langchain>=1.2` [S4]。这是提升“保证”力度最直接的一个开关。

2. **JSON Schema 必须显式包裹**：直接作为字典传给 `response_format` 不会被自动识别，必须用 `ProviderStrategy` 或 `ToolStrategy` 包起来 [S1]；而且 ProviderStrategy 的 JSON Schema 必须包含顶层 `title` 和 `description` [S4]。

3. **profile 数据要准确**：`langchain>=1.1` 会从模型 profile 动态读取是否支持原生结构化输出；读不到时需要手动指定，例如 `custom_profile = {"structured_output": True, ...}` [S1][S3]。profile 不准会导致策略选错。

4. **同时使用 tools 有前提**：若指定了 tools，模型必须支持“工具调用 + 结构化输出”同时使用 [S1][S3]，否则不能指望两者并存。

5. **选择合适的 schema 类型**：Pydantic 模型会返回经过字段校验的实例；dataclass、TypedDict、JSON Schema 返回 dict [S4][S5][S6]。需要字段级校验就优先 Pydantic。

## 三、兜底行为

如果所选模型不支持原生结构化输出，agent 会回退到 tool calling 策略 [S8]——这意味着“保证”的上限受模型能力限制，不能完全消除失败可能。

## 四、证据边界

本轮资料是部分文档（`partial_document`）。目录里出现了“Tool calling strategy / Error handling / Schema validation error”条目，但提供的片段只展示了工具消息与 `Returning structured response` 的输出 [S9]，**没有展开具体的错误处理、重试或校验失败后的行为**。这部分若要写进你的文档，需要另行查阅对应章节，我无法依据现有片段断言其细节。

## 建议的写法骨架（Python，基于 S4/S6 示例）

```python
agent = create_agent(
    model="gpt-5.5",
    tools=[],                       # 若设 tools，需模型同时支持两者 [S1]
    response_format=ProviderStrategy(ContactInfo, strict=True)  # strict 需 langchain>=1.2 [S4]
)
result = agent.invoke({...})
result["structured_response"]       # 固定取值位置 [S2]
```

自动引用ID检查：`{"cited_ids": ["S2", "S3", "S1", "S4", "S8", "S5", "S6", "S9"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Response format，阅读包第27～56行**

> ## Response format
> 
> Use `response_format` to control how the agent returns structured data:
> 
> - **`ToolStrategy[StructuredResponseT]`**: Uses tool calling for structured output
> - **`ProviderStrategy[StructuredResponseT]`**: Uses provider-native structured output
> - **`type[StructuredResponseT]`**: Schema type - automatically selects best strategy based on model capabilities
> - **`None`**: Structured output not explicitly requested
> 
> When a schema type is provided directly, LangChain automatically chooses:
> 
> - `ProviderStrategy` if the model and provider chosen supports native structured output (e.g. [OpenAI](/oss/integrations/providers/openai), [Anthropic (Claude)](/oss/integrations/providers/anthropic), or [xAI (Grok)](/oss/integrations/providers/xai)).
> - `ToolStrategy` for all other models.
> 
> <Warning>
> JSON Schema dictionaries must be wrapped in an explicit strategy (`ProviderStrategy` or `ToolStrategy`). They are not automatically detected when passed directly to `response_format`.
> </Warning>
> 
> <Note>
>     Support for native structured output features is read dynamically from the model's [profile data](/oss/langchain/models#model-profiles) if using `langchain>=1.1`. If data are not available, use another condition or specify manually:
>     ```python
>     custom_profile = {
>         "structured_output": True,
>         # ...
>     }
>     model = init_chat_model("...", profile=custom_profile)
>     ```
>     If tools are specified, the model must support simultaneous use of tools and structured output.
> </Note>
> 
> 

**[S2] Response format，阅读包第57～80行**

> The structured response is returned in the `structured_response` key of the agent's final state.
> :::
> :::js
> Structured output allows agents to return data in a specific, predictable format. Instead of parsing natural language responses, you get typed structured data.
> 
> <Tip>
> This page covers structured output with agents using `createAgent`. To use structured output directly on a model (outside of agents), see [Models - Structured output](/oss/langchain/models#structured-output).
> </Tip>
> 
> LangChain's prebuilt ReAct agent `createAgent` handles structured output automatically. The user sets their desired structured output schema, and when the model generates the structured data, it's captured, validated, and returned in the `structuredResponse` key of the agent's state.
> 
> ```ts
> type ResponseFormat = (
>     | ZodSchema<StructuredResponseT> // a Zod schema
>     | StandardSchema<StructuredResponseT> // any Standard Schema library
>     | Record<string, unknown> // a JSON Schema
> )
> 
> const agent = createAgent({
>     // ...
>     responseFormat: ResponseFormat | ResponseFormat[]
> })
> ```
> 
> 

**[S3] Response format，阅读包第81～112行**

> ## Response format
> 
> Controls how the agent returns structured data. You can provide a Zod schema, any [Standard Schema](https://standardschema.dev/)-compatible schema, or a JSON Schema object. By default, the agent uses a tool calling strategy, in which the output is created by an additional tool call. Certain models support native structured output, in which case the agent will use that strategy instead.
> 
> You can control the behavior by wrapping `ResponseFormat` in a `toolStrategy` or `providerStrategy` function call:
> 
> ```ts
> import { toolStrategy, providerStrategy } from "langchain";
> 
> const agent = createAgent({
>     // use a provider strategy if supported by the model
>     responseFormat: providerStrategy(z.object({ ... }))
>     // or enforce a tool strategy
>     responseFormat: toolStrategy(z.object({ ... }))
> })
> ```
> 
> The structured response is returned in the `structuredResponse` key of the agent's final state.
> 
> <Tip>
>     Support for native structured output features is read dynamically from the model's [profile data](/oss/langchain/models#model-profiles) if using `langchain>=1.1`. If data are not available, use another condition or specify manually:
>     ```typescript
>     const customProfile: ModelProfile = {
>         structuredOutput: true,
>         // ...
>     }
>     const model = await initChatModel("...", { profile: customProfile });
>     ```
>     If tools are specified, the model must support simultaneous use of tools and structured output.
> </Tip>
> :::
> 
> 

**[S4] Provider strategy，阅读包第113～149行**

> ## Provider strategy
> 
> Some model providers support structured output natively through their APIs (e.g. OpenAI, xAI (Grok), Gemini, Anthropic (Claude)). This is the most reliable method when available.
> 
> To use this strategy, configure a `ProviderStrategy`:
> 
> :::python
> ```python
> class ProviderStrategy(Generic[SchemaT]):
>     schema: type[SchemaT]
>     strict: bool | None = None
> ```
> <Info>
>     The `strict` param requires `langchain>=1.2`.
> </Info>
> 
> <ParamField path="schema" required>
>     The schema defining the structured output format. Supports:
>     - **Pydantic models**: `BaseModel` subclasses with field validation. Returns validated Pydantic instance.
>     - **Dataclasses**: Python dataclasses with type annotations. Returns dict.
>     - **TypedDict**: Typed dictionary classes. Returns dict.
>     - **JSON Schema**: Dictionary with JSON schema specification. Must include top-level `title` and `description` keys. Returns dict.
> </ParamField>
> 
> <ParamField path="strict">
>     Optional boolean parameter to enable strict schema adherence. Supported by some providers (e.g., [OpenAI](/oss/integrations/chat/openai) and [xAI](/oss/integrations/chat/xai)). Defaults to `None` (disabled).
> </ParamField>
> 
> LangChain automatically uses `ProviderStrategy` when you pass a schema type directly to @[`create_agent.response_format`][create_agent(response_format)] and the model supports native structured output:
> 
> <CodeGroup>
>     ```python Pydantic Model
>     from pydantic import BaseModel, Field
>     from langchain.agents import create_agent
> 
> 
>     class ContactInfo(BaseModel):
> 

**[S5] Provider strategy，阅读包第150～198行**

>         """Contact information for a person."""
>         name: str = Field(description="The name of the person")
>         email: str = Field(description="The email address of the person")
>         phone: str = Field(description="The phone number of the person")
> 
>     agent = create_agent(
>         model="gpt-5.5",
>         response_format=ContactInfo  # Auto-selects ProviderStrategy
>     )
> 
>     result = agent.invoke({
>         "messages": [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     })
> 
>     print(result["structured_response"])
>     # ContactInfo(name='John Doe', email='john@example.com', phone='(555) 123-4567')
>     ```
> 
>     ```python Dataclass
>     from dataclasses import dataclass
>     from langchain.agents import create_agent
> 
> 
>     @dataclass
>     class ContactInfo:
>         """Contact information for a person."""
>         name: str # The name of the person
>         email: str # The email address of the person
>         phone: str # The phone number of the person
> 
>     agent = create_agent(
>         model="gpt-5.5",
>         tools=[],
>         response_format=ContactInfo  # Auto-selects ProviderStrategy
>     )
> 
>     result = agent.invoke({
>         "messages": [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     })
> 
>     result["structured_response"]
>     # {'name': 'John Doe', 'email': 'john@example.com', 'phone': '(555) 123-4567'}
>     ```
> 
>     ```python TypedDict
>     from typing_extensions import TypedDict
>     from langchain.agents import create_agent
> 
> 
> 

**[S6] Provider strategy，阅读包第199～245行**

>     class ContactInfo(TypedDict):
>         """Contact information for a person."""
>         name: str # The name of the person
>         email: str # The email address of the person
>         phone: str # The phone number of the person
> 
>     agent = create_agent(
>         model="gpt-5.5",
>         tools=[],
>         response_format=ContactInfo  # Auto-selects ProviderStrategy
>     )
> 
>     result = agent.invoke({
>         "messages": [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     })
> 
>     result["structured_response"]
>     # {'name': 'John Doe', 'email': 'john@example.com', 'phone': '(555) 123-4567'}
>     ```
> 
>     ```python JSON Schema
>     from langchain.agents import create_agent
>     from langchain.agents.structured_output import ProviderStrategy
> 
> 
>     contact_info_schema = {
>         "title": "ContactInfo",
>         "type": "object",
>         "description": "Contact information for a person.",
>         "properties": {
>             "name": {"type": "string", "description": "The name of the person"},
>             "email": {"type": "string", "description": "The email address of the person"},
>             "phone": {"type": "string", "description": "The phone number of the person"}
>         },
>         "required": ["name", "email", "phone"]
>     }
> 
>     agent = create_agent(
>         model="gpt-5.5",
>         tools=[],
>         response_format=ProviderStrategy(contact_info_schema)
>     )
> 
>     result = agent.invoke({
>         "messages": [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     })
> 
> 

**[S7] Provider strategy，阅读包第289～329行**

>     // { name: "John Doe", email: "john@example.com", phone: "(555) 123-4567" }
>     ```
> 
>     ```ts Standard Schema
>     import * as v from "valibot";
>     import { toStandardJsonSchema } from "@valibot/to-json-schema";
>     import { createAgent, providerStrategy } from "langchain";
> 
>     const ContactInfo = toStandardJsonSchema(
>         v.object({
>             name: v.pipe(v.string(), v.description("The name of the person")),
>             email: v.pipe(v.string(), v.description("The email address of the person")),
>             phone: v.pipe(v.string(), v.description("The phone number of the person")),
>         })
>     );
> 
>     const agent = createAgent({
>         model: "gpt-5.5",
>         tools: [],
>         responseFormat: providerStrategy(ContactInfo)
>     });
> 
>     const result = await agent.invoke({
>         messages: [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     });
> 
>     console.log(result.structuredResponse);
>     // { name: "John Doe", email: "john@example.com", phone: "(555) 123-4567" }
>     ```
> 
>     ```ts JSON Schema
>     import { createAgent, providerStrategy } from "langchain";
> 
>     const contactInfoSchema = {
>         "type": "object",
>         "description": "Contact information for a person.",
>         "properties": {
>             "name": {"type": "string", "description": "The name of the person"},
>             "email": {"type": "string", "description": "The email address of the person"},
>             "phone": {"type": "string", "description": "The phone number of the person"}
>         },
> 

**[S8] Provider strategy，阅读包第330～365行**

>         "required": ["name", "email", "phone"]
>     }
> 
>     const agent = createAgent({
>         model: "gpt-5.5",
>         tools: [],
>         responseFormat: providerStrategy(contactInfoSchema)
>     });
> 
>     const result = await agent.invoke({
>         messages: [{"role": "user", "content": "Extract contact info from: John Doe, john@example.com, (555) 123-4567"}]
>     });
> 
>     console.log(result.structuredResponse);
>     // { name: "John Doe", email: "john@example.com", phone: "(555) 123-4567" }
>     ```
> </CodeGroup>
> :::
> 
> Provider-native structured output provides high reliability and strict validation because the model provider enforces the schema. Use it when available.
> 
> :::python
> <Note>
>     If the provider natively supports structured output for your model choice, it is functionally equivalent to write `response_format=ProductReview` instead of `response_format=ProviderStrategy(ProductReview)`.
> 
>     In either case, if structured output is not supported, the agent will fall back to a tool calling strategy.
> </Note>
> :::
> :::js
> <Note>
>     If the provider natively supports structured output for your model choice, it is functionally equivalent to write `responseFormat: contactInfoSchema` instead of `responseFormat: providerStrategy(contactInfoSchema)`.
> 
>     In either case, if structured output is not supported, the agent will fall back to a tool calling strategy.
> </Note>
> :::
> 
> 

**[S9] Tool calling strategy / Error handling / Schema validation error，阅读包第1007～1015行**

>   Args:
>     rating: 5
>     comment: Amazing product
> ================================= Tool Message =================================
> Name: ProductRating
> 
> Returning structured response: {'rating': 5, 'comment': 'Amazing product'}
> ```
> 
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `hf-actions` 第1～13行，章节：Actions:  Enabling the Agent to Engage with Its Environment

> # Actions:  Enabling the Agent to Engage with Its Environment
> 
> > [!TIP]
> > In this section, we explore the concrete steps an AI agent takes to interact with its environment. 
> >
> >  We’ll cover how actions are represented (using JSON or code), the importance of the stop and parse approach, and introduce different types of agents.
> 
> Actions are the concrete steps an **AI agent takes to interact with its environment**. 
> 
> Whether it’s browsing the web for information or controlling a physical device, each action is a deliberate operation executed by the agent. 
> 
> For example, an agent assisting with customer service might retrieve customer data, offer support articles, or transfer issues to a human representative.
> 
> 

- `lg-structured` 第57～80行，章节：Response format

> The structured response is returned in the `structured_response` key of the agent's final state.
> :::
> :::js
> Structured output allows agents to return data in a specific, predictable format. Instead of parsing natural language responses, you get typed structured data.
> 
> <Tip>
> This page covers structured output with agents using `createAgent`. To use structured output directly on a model (outside of agents), see [Models - Structured output](/oss/langchain/models#structured-output).
> </Tip>
> 
> LangChain's prebuilt ReAct agent `createAgent` handles structured output automatically. The user sets their desired structured output schema, and when the model generates the structured data, it's captured, validated, and returned in the `structuredResponse` key of the agent's state.
> 
> ```ts
> type ResponseFormat = (
>     | ZodSchema<StructuredResponseT> // a Zod schema
>     | StandardSchema<StructuredResponseT> // any Standard Schema library
>     | Record<string, unknown> // a JSON Schema
> )
> 
> const agent = cre

- `lg-test` 第187～199行，章节：Partial execution

> ## Partial execution
> 
> For agents made up of larger graphs, you may wish to test partial execution paths within your agent rather than the entire flow end-to-end. In some cases, it may make semantic sense to [restructure these sections as subgraphs](/oss/langgraph/use-subgraphs), which you can invoke in isolation as normal.
> 
> However, if you do not wish to make changes to your agent graph's overall structure, you can use LangGraph's persistence mechanisms to simulate a state where your agent is paused right before the beginning of the desired section, and will pause again at the end of the desired section. The steps are as follows:
> 
> :::python
> 1. Compile your agent with a checkpointer (the in-memory checkpointer @[`InMemorySaver`] will suffice for testing).
> 2. Call your agent's [`update_state`](/oss/langgraph/use-time-travel) method with an [`as_node`](/oss/langgraph/use-time-travel#from-a-specific-node) parameter set to the name of the node *before* the one you want to start your test.
> 3

### u03：什么是模型后训练

需要判断：资料覆盖SFT与RL的入门内容，不是后训练全景；检查是否承认边界，区分训练与RAG/提示词。

阅读来源：[Supervised Fine-Tuning](https://github.com/huggingface/course/blob/8b893f0ede6c781045692a7f892f25a0c92b4805/chapters/en/chapter11/1.mdx), [Open R1 for Students](https://github.com/huggingface/course/blob/8b893f0ede6c781045692a7f892f25a0c92b4805/chapters/en/chapter12/1.mdx)

模型回答（未人工评分）：

“模型后训练”（post-training）通常指：**在预训练基础模型之后，再用任务数据、交互数据或偏好/强化学习信号继续训练模型，使它更会遵循指令、更符合人类偏好、更擅长特定任务或推理**。本轮材料没有给“后训练”下独立定义，但其中的 SFT、LoRA、强化学习训练等内容，正是后训练阶段常见的工作。

可以这样理解：

- **SFT 是典型后训练方法之一**：材料说，现在更常见的是在广泛任务上同时微调语言模型，这称为监督微调（SFT），能让模型更通用、更能处理多样用例；多数人交互的 LLM 都经历过 SFT，以变得更有帮助、更符合人类偏好 [S2]。SFT 也用带标签的任务数据集，把预训练模型适配到具体任务 [S4]。
- **LoRA 是后训练中的高效微调技术**：它通过给模型层加低秩矩阵来微调，保留预训练知识，并显著节省内存，使资源有限时也能微调大模型 [S5]。注意，LoRA 更像“怎么做微调”的技术手段，不是与 SFT 并列的训练目标。
- **强化学习可用于后训练中的推理/对齐**：Open R1 项目用强化学习鼓励 LLM“思考”和推理，训练模型生成 thoughts 和 outputs，并把二者结构化分开 [S10]。这可以看作后训练中提升推理能力或进行对齐的一类做法。
- **评估是配套环节**：后训练后要评估模型在任务数据集上的表现 [S6]。

所以，按本轮材料可归纳为：**后训练不是单一方法，而是预训练之后的一整套适配与对齐阶段**，材料中涉及的代表性环节包括 SFT、LoRA 高效微调、强化学习训练和评估 [S2][S4][S5][S10][S6]。

补充解释：在通用语境中，预训练通常指在海量通用语料上学习基础语言能力；后训练则常包括指令微调/SFT、偏好优化（如 RLHF、DPO）和推理强化等。本轮材料主要展开了 SFT 与 Open R1 的强化学习路线，但没有系统给出“后训练”的完整分类和先后流程。

自动引用ID检查：`{"cited_ids": ["S2", "S4", "S5", "S10", "S6"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Source: Supervised Fine-Tuning，阅读包第3～4行**

> # Source: Supervised Fine-Tuning
> 
> 

**[S2] Supervised Fine-Tuning，阅读包第5～8行**

> # Supervised Fine-Tuning
> 
> In [Chapter 2 Section 2](/course/chapter2/2), we saw that generative language models can be fine-tuned on specific tasks like summarization and question answering. However, nowadays it is far more common to fine-tune language models on a broad range of tasks simultaneously; a method known as supervised fine-tuning (SFT). This process helps models become more versatile and capable of handling diverse use cases. Most LLMs that people interact with on platforms like ChatGPT have undergone SFT to make them more helpful and aligned with human preferences. We will separate this chapter into four sections:
> 
> 

**[S3] Supervised Fine-Tuning / 1️⃣ Chat Templates，阅读包第9～12行**

> ## 1️⃣ Chat Templates
> 
> Chat templates structure interactions between users and AI models, ensuring consistent and contextually appropriate responses. They include components like system prompts and role-based messages.
> 
> 

**[S4] Supervised Fine-Tuning / 2️⃣ Supervised Fine-Tuning，阅读包第13～16行**

> ## 2️⃣ Supervised Fine-Tuning
> 
> Supervised Fine-Tuning (SFT) is a critical process for adapting pre-trained language models to specific tasks. It involves training the model on a task-specific dataset with labeled examples. For a detailed guide on SFT, including key steps and best practices, see [the supervised fine-tuning section of the TRL documentation](https://huggingface.co/docs/trl/en/sft_trainer).
> 
> 

**[S5] Supervised Fine-Tuning / 3️⃣ Low Rank Adaptation (LoRA)，阅读包第17～20行**

> ## 3️⃣ Low Rank Adaptation (LoRA)
> 
> Low Rank Adaptation (LoRA) is a technique for fine-tuning language models by adding low-rank matrices to the model's layers. This allows for efficient fine-tuning while preserving the model's pre-trained knowledge. One of the key benefits of LoRA is the significant memory savings it offers, making it possible to fine-tune large models on hardware with limited resources.
> 
> 

**[S6] Supervised Fine-Tuning / 4️⃣ Evaluation，阅读包第21～27行**

> ## 4️⃣ Evaluation
> 
> Evaluation is a crucial step in the fine-tuning process. It allows us to measure the performance of the model on a task-specific dataset.
> 
> > [!TIP]
> > ⚠️ In order to benefit from all features available with the Model Hub and 🤗 Transformers, we recommend <a href="https://huggingface.co/join">creating an account</a>.
> 
> 

**[S7] Supervised Fine-Tuning / References，阅读包第28～38行**

> ## References
> 
> - [Transformers documentation on chat templates](https://huggingface.co/docs/transformers/main/en/chat_templating)
> - [Script for Supervised Fine-Tuning in TRL](https://github.com/huggingface/trl/blob/main/trl/scripts/sft.py)
> - [`SFTTrainer` in TRL](https://huggingface.co/docs/trl/main/en/sft_trainer)
> - [Direct Preference Optimization Paper](https://arxiv.org/abs/2305.18290)
> - [Supervised Fine-Tuning with TRL](https://huggingface.co/docs/trl/sft_trainer)
> - [How to fine-tune Google Gemma with ChatML and Hugging Face TRL](https://github.com/huggingface/alignment-handbook)  
> - [Fine-tuning LLM to Generate Persian Product Catalogs in JSON Format](https://huggingface.co/learn/cookbook/en/fine_tuning_llm_to_generate_persian_product_catalogs_in_json_format)
> 
> 
> 

**[S8] Source: Open R1 for Students，阅读包第39～40行**

> # Source: Open R1 for Students
> 
> 

**[S9] Open R1 for Students，阅读包第41～46行**

> # Open R1 for Students
> 
> Welcome to an exciting journey into the world of open-source AI with reinforcement learning! This chapter is designed to help students understand reinforcement learning and its role in LLMs.
> 
> We will also explore [Open R1](https://github.com/huggingface/open-r1), a groundbreaking community project that's making advanced AI accessible to everyone. Specifically, this course is to help students and learners to use and contribute to [Open R1](https://github.com/huggingface/open-r1).
> 
> 

**[S10] Open R1 for Students / What You'll Learn，阅读包第47～75行**

> ## What You'll Learn
> 
> In this chapter, we'll break down complex concepts into easy-to-understand pieces and show you how you can be part of this exciting project to make LLMs reason on complex problems. 
> 
> LLMs have shown excellent performance on many generative tasks. However, up until recently they have struggled on complex problems that require reasoning. For example, they struggle to deal with puzzles or math problems that require multiple steps of reasoning. 
> 
> Open R1 is a project that aims to make LLMs reason on complex problems. It does this by using reinforcement learning to encourage LLMs to 'think' and reason. 
> 
> In simple terms, the model is trained to generate thoughts as well as outputs, and to structure these thoughts and outputs so that they can be handled separately by the user. 
> 
> Let's take a look at an example. As we gave ourself the task of solving the following problem, we might think like this:
> 
> ```sh
> Problem: "I have 3 apples and 2 oranges. How many pieces of fruit do I have in total?"
> 
> Thought: "I need to add the number of apples and oranges to get the total number of pieces of fruit."
> 
> Answer: "5"
> ```
> 
> We can then structure this thought and answer so that they can be handled separately by the user. For reasoning tasks, LLMs can be trained to generate thoughts and answers in the following format:
> 
> ```sh
> <think>I need to add the number of apples and oranges to get the total number of pieces of fruit.</think>
> 5
> ```
> 
> As a user, we can then extract the thought and answer from the model's output and use them to solve the problem.
> 
> 

**[S11] Open R1 for Students / Why This Matters for Students，阅读包第76～83行**

> ## Why This Matters for Students
> 
> As a student, understanding Open R1 and the role of reinforcement learning in LLMs is valuable because:
> - It shows you how cutting-edge AI is developed
> - It gives you hands-on opportunities to learn and contribute
> - It helps you understand where AI technology is heading
> - It opens doors to future career opportunities in AI
> 
> 

**[S12] Open R1 for Students / Chapter Overview，阅读包第84～87行**

> ## Chapter Overview
> 
> This chapter is divided into four sections, each focusing on a different aspect of Open R1:
> 
> 

**[S13] Open R1 for Students / Chapter Overview / 1️⃣ Introduction to Reinforcement Learning and its Role in LLMs，阅读包第88～94行**

> ### 1️⃣ Introduction to Reinforcement Learning and its Role in LLMs
> We'll explore the basics of Reinforcement Learning (RL) and its role in training LLMs.
> - What is RL?
> - How is RL used in LLMs?
> - What is DeepSeek R1?
> - What are the key innovations of DeepSeek R1?
> 
> 

**[S14] Open R1 for Students / Chapter Overview / 2️⃣ Understanding the DeepSeek R1 Paper，阅读包第95～100行**

> ### 2️⃣ Understanding the DeepSeek R1 Paper
> We'll break down the research paper that inspired [Open R1](https://huggingface.co/open-r1):
> - Key innovations and breakthroughs
> - The training process and architecture
> - Results and their significance
> 
> 

**[S15] Open R1 for Students / Chapter Overview / 3️⃣ Implementing GRPO in TRL，阅读包第101～105行**

> ### 3️⃣ Implementing GRPO in TRL
> We'll get practical with code examples:
> - How to use the Transformer Reinforcement Learning (TRL) library
> - Setting up GRPO training
> 
> 

**[S16] Open R1 for Students / Chapter Overview / 4️⃣ Practical use case to align a model，阅读包第106～110行**

> ### 4️⃣ Practical use case to align a model
> We'll look at a practical use case to align a model using Open R1.
> - How to train a model using GRPO in TRL
> - Share your model on the [Hugging Face Hub](https://huggingface.co/models)
> 
> 

**[S17] Open R1 for Students / Prerequisites，阅读包第111～122行**

> ## Prerequisites
> 
> To get the most out of this chapter, it's helpful to have:
> - Solid understanding of Python programming
> - Familiarity with machine learning concepts
> - Interest in AI and language models
> 
> Don't worry if you're missing some of these – we'll explain key concepts as we go along! 🚀
> 
> > [!TIP]
> > If you don't have all the prerequisites, check out this [course](/course/chapter1/1) from units 1 to 11
> 
> 

**[S18] Open R1 for Students / How to Use This Chapter，阅读包第123～130行**

> ## How to Use This Chapter
> 
> 1. **Read Sequentially**: The sections build on each other, so it's best to read them in order
> 2. **Share Notes**: Write down key concepts and questions and discuss them within the community in [Discord](https://discord.gg/UrrTSsSyjb)
> 3. **Try the Code**: When we get to practical examples, try them yourself
> 4. **Join the Community**: Use the resources we provide to connect with other learners
> 
> Let's begin our exploration of Open R1 and discover how you can be part of making AI more accessible to everyone! 🚀
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `hf-post-training` 第9～12行，章节：Supervised Fine-Tuning / 2️⃣ Supervised Fine-Tuning

> ## 2️⃣ Supervised Fine-Tuning
> 
> Supervised Fine-Tuning (SFT) is a critical process for adapting pre-trained language models to specific tasks. It involves training the model on a task-specific dataset with labeled examples. For a detailed guide on SFT, including key steps and best practices, see [the supervised fine-tuning section of the TRL documentation](https://huggingface.co/docs/trl/en/sft_trainer).
> 
> 

- `hf-rl` 第66～70行，章节：Open R1 for Students / Chapter Overview / 4️⃣ Practical use case to align a model

> ### 4️⃣ Practical use case to align a model
> We'll look at a practical use case to align a model using Open R1.
> - How to train a model using GRPO in TRL
> - Share your model on the [Hugging Face Hub](https://huggingface.co/models)
> 
> 

- `hf-post-training` 第13～16行，章节：Supervised Fine-Tuning / 3️⃣ Low Rank Adaptation (LoRA)

> ## 3️⃣ Low Rank Adaptation (LoRA)
> 
> Low Rank Adaptation (LoRA) is a technique for fine-tuning language models by adding low-rank matrices to the model's layers. This allows for efficient fine-tuning while preserving the model's pre-trained knowledge. One of the key benefits of LoRA is the significant memory savings it offers, making it possible to fine-tune large models on hardware with limited resources.
> 
> 

### u04：agent开发是否推荐从例如pi这样的开源架构起步

需要判断：pi暂按badlogic/pi-mono理解；检查是否结合用户学习目标给出有条件建议，不把README主张当作适用性证明。

阅读来源：[Pi](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/README.md), [@earendil-works/pi-agent-core](https://github.com/badlogic/pi-mono/blob/e28e708049650d9b5382bb83ef93be04a0322ffa/packages/agent/README.md)

模型回答（未人工评分）：

**结论：可以有条件地推荐。** 如果你的目标是“快速拿到一个可运行、可扩展、可读源码的 agent 基座”，Pi 这类开源架构适合作为起点；但如果你期待开箱即用的完整平台或强权限隔离，它并不直接满足，需要自己补。

### 支持从 Pi 起步的证据

- Pi 的定位就是**最小、可扩展的 agent harness**，强调“让 Pi 适配你的工作流”，可用 extensions、skills、prompt templates、themes 定制，并打包通过 npm 或 git 共享[S2]。
- 接入方式比较完整：可交互使用、以 print/JSON 模式自动化、通过 RPC 控制，或用 TypeScript SDK 构建应用[S2]。
- 包分层清晰：`pi-ai` 提供多 provider LLM API，`pi-agent-core` 提供带工具调用和状态管理的 agent runtime，另有 CLI、TUI 等[S5][S13]。
- `pi-agent-core` 文档给出了 `Agent` 类的 Quick Start、事件流订阅、低层 `agentLoop`/`agentLoopContinue`，以及 MCP/Codemode 的封装示例[S15][S21][S19]。
- 许可为 MIT，便于学习和二次开发[S11][S22]。

### 需要提前接受的前提与限制

1. **它不是“功能齐全”的成品。** 文档明确说 Pi 自带强大默认能力，但**跳过了 sub-agents 和 plan mode**；需要你让 Pi 构建，或安装相应包[S2]。也就是说，你得到的是基座，不是完整产品。
2. **没有内置权限系统。** Pi 不限制文件系统、进程、网络或凭据访问，默认以启动它的用户和进程权限运行；需要更强边界时应容器化或沙箱化，文档列出 Gondolin、Plain Docker、OpenShell 三种模式[S6]。生产环境尤其要先处理这一点。
3. **低层 API 有事件屏障差异。** `agentLoop()`/`agentLoopContinue()` 的事件流是观察性的，不等待异步事件处理完成；若需要消息处理在工具预检前形成屏障，应使用 `Agent` 类[S21]。
4. **运行环境有要求。** 需要 Node.js 22.19 或更新版本；安装器会固定依赖，而直接用 npm 安装不会固定传递依赖[S3]。
5. **本轮文档是部分覆盖。** 以上判断只基于当前可见片段，不能据此推断 Pi 全文或生态没有其他能力。

### 适合与不适合的场景

**比较适合从 Pi 起步：**
- 想学习 agent loop、工具调用、状态管理和事件流；
- 需要多 provider 模型接入；
- 希望先跑通单 agent，再按需加扩展；
- 能接受自己补权限、子 agent、计划模式等能力。

**不建议直接作为生产基座：**
- 需要强隔离、细粒度权限、合规审计，却又不准备做容器化/沙箱；
- 想要开箱即用的完整 agent 平台；
- 团队不熟悉 TypeScript/Node 生态。

**补充解释（非作者观点）：** 实际选型时，可以先用 Pi 跑通“单 agent + 工具调用 + 流式输出”的最小闭环，再评估权限隔离、可观测性、评测和部署成本；不要因为架构“极简”就默认它适合直接上生产。

如果你愿意说明目标场景（学习原型、内部工具还是生产产品）和团队技术栈，我可以进一步帮你判断 Pi 与其他起步方式的取舍。

自动引用ID检查：`{"cited_ids": ["S2", "S5", "S13", "S15", "S21", "S19", "S11", "S22", "S6", "S3"], "invalid_ids": [], "status": "present"}`。这不检查支持性。

<details><summary>实际送入模型的原文证据（点击展开，逐一核对引用）</summary>

**[S1] Source: Pi，阅读包第3～16行**

> # Source: Pi
> 
> <p align="center">
>   <a href="https://pi.dev">
>     <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
>   </a>
> </p>
> <p align="center">
>   <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
>   <a href="https://www.npmjs.com/package/@earendil-works/pi-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@earendil-works/pi-coding-agent?style=flat-square" /></a>
> </p>
> 
> > New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).
> 
> 

**[S2] Pi，阅读包第17～26行**

> # Pi
> 
> Pi is a minimal, extensible agent harness that you can make your own.
> 
> Adapt Pi to your workflows, not the other way around. Customize Pi with [extensions](packages/coding-agent/docs/extensions.md), [skills](packages/coding-agent/docs/skills.md), [prompt templates](packages/coding-agent/docs/prompt-templates.md), and [themes](packages/coding-agent/docs/themes.md). Bundle them as [Pi packages](packages/coding-agent/docs/packages.md) and share via npm or git.
> 
> Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way.
> 
> Use Pi [interactively](packages/coding-agent/docs/usage.md), automate it in [print or JSON mode](packages/coding-agent/docs/cli.md), control it over [RPC](packages/coding-agent/docs/rpc.md), or build apps with the [Pi TypeScript SDK](packages/coding-agent/docs/sdk.md). See [OpenClaw](https://github.com/OpenClaw/OpenClaw) for a real-world integration.
> 
> 

**[S3] Pi / Getting started，阅读包第27～59行**

> ## Getting started
> 
> Install the command-line interface:
> 
> ```bash
> curl -fsSL https://pi.dev/install.sh | sh
> ```
> 
> On Windows:
> 
> ```shell
> powershell -c "irm https://pi.dev/install.ps1 | iex"
> ```
> 
> The installer pins all dependencies and updates Pi with `pi update`. Alternatively, install directly with npm, which does not pin transitive dependencies:
> 
> ```bash
> npm install -g --ignore-scripts @earendil-works/pi-coding-agent
> ```
> 
> Pi requires Node.js 22.19 or newer. The macOS, Linux, and Windows installers can install it if needed. Pi does not require dependency lifecycle scripts for a normal npm installation.
> 
> Start Pi in the directory where you want it to work:
> 
> ```bash
> cd /path/to/project
> pi
> ```
> 
> For a built-in AI provider, run `/login` inside Pi to connect a subscription or API key. Then give Pi a task.
> 
> See the [documentation](https://pi.dev/docs/latest) for full setup and usage instructions, or [visit pi.dev](https://pi.dev) for demos.
> 
> 

**[S4] Pi / Run with Nix，阅读包第60～75行**

> ## Run with Nix
> 
> ```bash
> nix run github:earendil-works/pi/stable
> ```
> 
> `stable` points at the latest release. Install it with `nix profile add github:earendil-works/pi/stable` and update with `nix profile upgrade pi`. Use a release tag such as `github:earendil-works/pi/v1.0.0` to pin a version, or `github:earendil-works/pi` for unreleased changes on `main`. Nix builds Pi from source.
> 
> Supports ARM64 and x86-64 on Linux and macOS. Use `nix build .` or `nix run .` to build or run your checkout.
> 
> Nix builds are offline, so the bundled model data comes from a pi.dev model catalog revision pinned in `nix/model-catalog.json`. At runtime, Pi still overlays newer catalog data from pi.dev as usual. The Nix workflow replaces the pin on `main` when it no longer matches the checkout, for example after a provider is added or gains a new model type. To refresh it by hand:
> 
> ```bash
> npm run update:model-catalog-pin
> ```
> 
> 

**[S5] Pi / Packages，阅读包第76～91行**

> ## Packages
> 
> This monorepo contains the Pi CLI and its supporting libraries.
> 
> | Package | Description |
> |---------|-------------|
> | **[@earendil-works/chord](packages/chord)** | Typed host runtime for hot-reloadable plugins, contracts, replicated state, and RPC over JSON links |
> | **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
> | **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
> | **[@earendil-works/pi-durable](packages/durable)** | Durable conversation, task, and document runtime |
> | **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
> | **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
> | **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
> 
> For Slack/chat automation and workflows see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).
> 
> 

**[S6] Pi / Permissions & Containerization，阅读包第92～101行**

> ## Permissions & Containerization
> 
> Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.
> 
> If you need stronger boundaries, containerize or sandbox Pi. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:
> 
> - **Gondolin extension**: keep `pi` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
> - **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
> - **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.
> 
> 

**[S7] Pi / Contributing，阅读包第102～105行**

> ## Contributing
> 
> See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).  Longer term plans for Pi can also be found in [RFCs](https://rfc.earendil.com/keyword/pi/).
> 
> 

**[S8] Pi / Development，阅读包第106～116行**

> ## Development
> 
> ```bash
> npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
> npm run build         # Refresh model data, then build all packages
> npm run build:offline # Rebuild using existing model data without network access
> npm run check         # Lint, format, and type check
> ./test.sh            # Run tests (skips LLM-dependent tests without API keys)
> ./pi-test.sh         # Run pi from sources (can be run from any directory)
> ```
> 
> 

**[S9] Pi / Development / Using local packages outside the monorepo，阅读包第117～158行**

> ### Using local packages outside the monorepo
> 
> Build every public package into one coherent local artifact set:
> 
> ```bash
> npm run pack:packages -- --out .artifacts/pi-packages
> ```
> 
> This refreshes model data before building `pi-ai`. To avoid network access when
> model data is already hydrated, pass `--offline-model-data`.
> 
> Then configure an external project to consume one package and resolve all of
> its Pi dependencies from the same artifact set. npm is the default:
> 
> ```bash
> node scripts/use-local-packages.mjs \
>   --manifest .artifacts/pi-packages/manifest.json \
>   --consumer ../my-project \
>   --package @earendil-works/pi-durable \
>   --package @earendil-works/pi-agent-core
> cd ../my-project
> npm install --ignore-scripts
> ```
> 
> For a pnpm project, point `--consumer` at the workspace root:
> 
> ```bash
> node scripts/use-local-packages.mjs \
>   --manifest .artifacts/pi-packages/manifest.json \
>   --consumer ../my-project \
>   --package @earendil-works/pi-agent-core \
>   --package-manager pnpm
> cd ../my-project
> pnpm install --ignore-scripts
> ```
> 
> Repeat `--package` for each direct dependency. The command updates the
> consumer's `package.json` with content-addressed local `file:` references. It
> writes transitive overrides to `package.json` for npm or `pnpm-workspace.yaml`
> for pnpm. Keep the artifact directory available while installing or updating
> the consumer. Re-run both commands after changing Pi source.
> 
> 

**[S10] Pi / Building standalone binaries from release source，阅读包第159～171行**

> ## Building standalone binaries from release source
> 
> GitHub releases include a versioned source archive covered by the release's `SHA256SUMS` file. Extract it and run the same build script used for the official standalone binaries:
> 
> ```bash
> VERSION="<release-version>"
> tar -xzf "pi-${VERSION}-source.tar.gz"
> cd "pi-${VERSION}"
> ./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
> ```
> 
> The archive includes release model data and native prebuilds. `--offline-model-data` uses that model data without refreshing provider catalogs. The script installs dependencies and builds the executable with its runtime assets; pass `--skip-install` if dependencies are already provided.
> 
> 

**[S11] Pi / License，阅读包第202～212行**

> ## License
> 
> MIT
> 
> <p align="center">
>   <a href="https://pi.dev">pi.dev</a> domain graciously donated by
>   <br /><br />
>   <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
> </p>
> 
> 
> 

**[S12] Source: @earendil-works/pi-agent-core，阅读包第213～214行**

> # Source: @earendil-works/pi-agent-core
> 
> 

**[S13] @earendil-works/pi-agent-core，阅读包第215～218行**

> # @earendil-works/pi-agent-core
> 
> Stateful agent with tool execution and event streaming. Built on `@earendil-works/pi-ai`.
> 
> 

**[S14] @earendil-works/pi-agent-core / Installation，阅读包第219～224行**

> ## Installation
> 
> ```bash
> npm install @earendil-works/pi-agent-core
> ```
> 
> 

**[S15] @earendil-works/pi-agent-core / Quick Start，阅读包第225～254行**

> ## Quick Start
> 
> ```typescript
> import { Agent } from "@earendil-works/pi-agent-core";
> import { createModels } from "@earendil-works/pi-ai";
> import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
> 
> const models = createModels();
> models.setProvider(anthropicProvider());
> const model = models.getModel("anthropic", "claude-sonnet-4-6");
> if (!model) throw new Error("Model not found");
> 
> const agent = new Agent({
>   initialState: {
>     systemPrompt: "You are a helpful assistant.",
>     model,
>   },
>   streamFn: models.streamSimple.bind(models),
> });
> 
> agent.subscribe((event) => {
>   if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
>     // Stream just the new text chunk
>     process.stdout.write(event.assistantMessageEvent.delta);
>   }
> });
> 
> await agent.prompt("Hello!");
> ```
> 
> 

**[S16] @earendil-works/pi-agent-core / Core Concepts，阅读包第255～256行**

> ## Core Concepts
> 
> 

**[S17] @earendil-works/pi-agent-core / Agent State，阅读包第524～527行**

> During streaming, `agent.state.streamingMessage` contains the current partial assistant message.
> 
> `agent.state.isStreaming` remains `true` until the run fully settles, including awaited `agent_end` subscribers.
> 
> 

**[S18] @earendil-works/pi-agent-core / Methods，阅读包第528～529行**

> ## Methods
> 
> 

**[S19] @earendil-works/pi-agent-core / Tools / MCP and Codemode，阅读包第720～723行**

> ### MCP and Codemode
> 
> `@earendil-works/pi-mcp` connects to MCP servers and `@earendil-works/pi-codemode` runs model-written JavaScript that calls tools. [examples/mcp-codemode](examples/mcp-codemode) wraps both as `AgentTool`s: one tool per MCP tool, and a `codemode` tool whose scripts call the agent's tools through `runToolCall()`, so `beforeToolCall` and `afterToolCall` apply to those calls too.
> 
> 

**[S20] @earendil-works/pi-agent-core / Proxy Usage，阅读包第724～740行**

> ## Proxy Usage
> 
> For browser apps that proxy through a backend:
> 
> ```typescript
> import { Agent, streamProxy } from "@earendil-works/pi-agent-core";
> 
> const agent = new Agent({
>   streamFn: (model, context, options) =>
>     streamProxy(model, context, {
>       ...options,
>       authToken: "...",
>       proxyUrl: "https://your-server.com",
>     }),
> });
> ```
> 
> 

**[S21] @earendil-works/pi-agent-core / Low-Level API，阅读包第741～775行**

> ## Low-Level API
> 
> For direct control without the Agent class:
> 
> ```typescript
> import { agentLoop, agentLoopContinue } from "@earendil-works/pi-agent-core";
> 
> const context: AgentContext = {
>   messages: [{ role: "system", content: "You are helpful.", timestamp: Date.now() }],
>   tools: [],
> };
> 
> const config: AgentLoopConfig = {
>   model: getModel("openai", "gpt-4o"),
>   convertToLlm: (msgs) => msgs.filter(m => ["user", "assistant", "toolResult"].includes(m.role)),
>   toolExecution: "parallel",  // overridden by per-tool executionMode if set
>   beforeToolCall: async ({ toolCall, args, context }) => undefined,
>   afterToolCall: async ({ toolCall, result, isError, context }) => undefined,
> };
> 
> const userMessage = { role: "user", content: "Hello", timestamp: Date.now() };
> 
> const streamFn = models.streamSimple.bind(models);
> for await (const event of agentLoop([userMessage], context, config, undefined, streamFn)) {
>   console.log(event.type);
> }
> 
> // Continue from existing context
> for await (const event of agentLoopContinue(context, config, undefined, streamFn)) {
>   console.log(event.type);
> }
> ```
> 
> These low-level streams are observational. They preserve event order, but they do not wait for your async event handling to settle before later producer phases continue. If you need message processing to act as a barrier before tool preflight, use the `Agent` class instead of raw `agentLoop()` or `agentLoopContinue()`.
> 
> 

**[S22] @earendil-works/pi-agent-core / License，阅读包第776～778行**

> ## License
> 
> MIT
> 

</details>

知识库混合检索前三候选（范围与上面的阅读文档不同）：

- `pi-overview` 第13～22行，章节：Pi

> # Pi
> 
> Pi is a minimal, extensible agent harness that you can make your own.
> 
> Adapt Pi to your workflows, not the other way around. Customize Pi with [extensions](packages/coding-agent/docs/extensions.md), [skills](packages/coding-agent/docs/skills.md), [prompt templates](packages/coding-agent/docs/prompt-templates.md), and [themes](packages/coding-agent/docs/themes.md). Bundle them as [Pi packages](packages/coding-agent/docs/packages.md) and share via npm or git.
> 
> Pi ships with powerful defaults but skips features like sub-agents and plan mode. Ask Pi to build what you want, or install a package that does it your way.
> 
> Use Pi [interactively](packages/coding-agent/docs/usage.md), automate it in [print or JSON mode](packages/coding-agent/docs/cli.md), control it over [RPC](packages/coding-agent/docs/rpc.md), or build apps with the [Pi TypeScript SDK](packages/coding-agent/docs/sdk.md). See [OpenClaw](https://github.com/OpenClaw/OpenClaw) for a real-world integration.
> 
> 

- `pi-overview` 第56～71行，章节：Pi / Run with Nix

> ## Run with Nix
> 
> ```bash
> nix run github:earendil-works/pi/stable
> ```
> 
> `stable` points at the latest release. Install it with `nix profile add github:earendil-works/pi/stable` and update with `nix profile upgrade pi`. Use a release tag such as `github:earendil-works/pi/v1.0.0` to pin a version, or `github:earendil-works/pi` for unreleased changes on `main`. Nix builds Pi from source.
> 
> Supports ARM64 and x86-64 on Linux and macOS. Use `nix build .` or `nix run .` to build or run your checkout.
> 
> Nix builds are offline, so the bundled model data comes from a pi.dev model catalog revision pinned in `nix/model-catalog.json`. At runtime, Pi still overlays newer catalog data from pi.dev as usual. The Nix workflow replaces the pin on `main` when it no longer matches the checkout, for example after a provider is added or gains a new model type. To refresh it by hand:
> 
> ```bash
> npm run update:model-catalog-pin
> ```
> 
> 

- `pi-overview` 第72～87行，章节：Pi / Packages

> ## Packages
> 
> This monorepo contains the Pi CLI and its supporting libraries.
> 
> | Package | Description |
> |---------|-------------|
> | **[@earendil-works/chord](packages/chord)** | Typed host runtime for hot-reloadable plugins, contracts, replicated state, and RPC over JSON links |
> | **[@earendil-works/pi-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
> | **[@earendil-works/pi-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
> | **[@earendil-works/pi-durable](packages/durable)** | Durable conversation, task, and document runtime |
> | **[@earendil-works/pi-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
> | **[@earendil-works/pi-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
> | **[@earendil-works/pi-tui](packages/tui)** | Terminal UI library with differential rendering |
> 
> For Slack/chat automation and workflows see 

