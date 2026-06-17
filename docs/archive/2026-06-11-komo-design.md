# KOMO (Knowledge On My Own) — 设计文档

> 状态：草案 | 日期：2026-06-11 | 作者：用户 + Claude

---

## 一、产品概述

### 1.1 定位

KOMO 是一款**AI驱动的个人知识管理工具**，核心差异化能力是：在用户与AI对话过程中，自动从AI回复中提取和归纳知识要点，实现"积累旧知识 → 对话中获取新知识 → 打破认知约束"的正循环。

**一句话描述**：具有"反向知识提取"能力的AI知识库——不仅能用你的知识回答问题，还能从回答中帮你发现你不知道自己不知道的东西。

### 1.2 产品形态

- **核心**：AI知识库 + AI对话助手（类似 Notion AI + 知识库）
- **差异化**：知识自动发现（对话中反向提取知识、标注新知、冲突检测）
- **平台**：Web端 + App端（React Native）
- **商业模式**：开源核心 + 云端托管服务（类似 GitLab/Cal.com）

### 1.3 目标用户

个人知识工作者 + 大众消费者。数据模型层面预留多租户扩展空间（`workspace_id`），便于未来扩展到团队/企业版。

---

## 二、技术架构

### 2.1 技术栈

| 层 | 技术 | 说明 |
|---|---|---|
| Web 前端 | React 18 + Next.js 14 (App Router) | SSR/SSG，文件路由 |
| App 前端 | React Native 0.76+ / Expo SDK 52+ | 跨平台原生渲染 |
| 共享层 | npm workspace / Turborepo | 类型、API Client、状态管理、工具函数 |
| 主后端 | Java 17 + Spring Boot 3.x | 业务逻辑、用户系统、知识CRUD、搜索 |
| AI 微服务 | Python 3.12 + FastAPI | LLM调用、知识提取、RAG、向量化 |
| 服务间通信 | gRPC (protobuf) | 强类型契约，高性能 |
| 前端↔后端 | REST + SSE (Server-Sent Events) | 普通操作用REST，AI流式响应用SSE |
| 业务数据库 | PostgreSQL 16 | 用户、知识条目、分类、会话、草稿 |
| 向量数据库 | Qdrant | 语义搜索、RAG检索 |
| 缓存（延后） | Redis 7 | 会话缓存、任务队列 |
| AI 模型 | Claude API (Anthropic) | 对话、知识提取、向量嵌入 |
| 容器化 | Docker + docker-compose | 全部基础设施容器化管理 |

### 2.2 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                        客户端层                               │
│  ┌──────────────────┐          ┌──────────────────┐          │
│  │  Next.js (Web)    │          │  React Native     │          │
│  │  localhost:3001   │          │  Expo (App)       │          │
│  └────────┬─────────┘          └────────┬─────────┘          │
│           │ REST + SSE                   │ REST + SSE         │
└───────────┼──────────────────────────────┼────────────────────┘
            │                              │
            ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│                     API 网关层 (Nginx, 仅生产环境)             │
│          路由 · 限流 · 静态资源 · SSL终端                      │
└───────────────────────────┬──────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Java Spring   │  │ Python AI     │  │ 基础设施       │
│ Boot :8081    │  │ FastAPI :8001 │  │               │
│               │  │               │  │ PostgreSQL:5434│
│ • 用户认证    │  │ • LLM调用     │  │ Qdrant:6333   │
│ • 知识CRUD    │  │ • 知识提取    │  │ Redis:6380     │
│ • 全文搜索    │◄─┤ • RAG检索     │  │ (延后启用)     │
│ • 分类管理    │gRPC│ • 冲突检测   │  │               │
│ • 导入导出    │  │ • 新知标注    │  │               │
│ • 文件上传    │  │               │  │               │
└───────────────┘  └───────┬───────┘  └───────────────┘
                            │
                            ▼
                   ┌───────────────┐
                   │ Claude API    │
                   │ (外部)        │
                   └───────────────┘
```

### 2.3 端口规划

| 服务 | 端口 | 说明 |
|---|---|---|
| PostgreSQL | `5434` | 业务数据库 |
| Qdrant | `6333` (gRPC) / `6334` (HTTP) | 向量数据库 |
| Redis | `6380` | 缓存（延后启用） |
| Java Spring Boot | `8081` | 主后端 |
| Python FastAPI | `8001` | AI 微服务 |
| Next.js Web | `3001` | Web 前端开发服务器 |
| Nginx | `80/443` | 仅生产环境 |

### 2.4 目录结构

```
knowledge-on-my-own/
├── KOMO/                              ← 工程代码
│   ├── backend/                       ← Java Spring Boot
│   │   ├── src/main/java/com/komo/
│   │   │   ├── controller/            ← REST 控制器
│   │   │   ├── service/               ← 业务逻辑
│   │   │   ├── repository/            ← 数据访问
│   │   │   ├── entity/                ← JPA 实体
│   │   │   ├── dto/                   ← 数据传输对象
│   │   │   ├── config/                ← Spring 配置
│   │   │   ├── security/              ← JWT/鉴权
│   │   │   └── exception/             ← 异常处理
│   │   ├── src/main/resources/
│   │   │   └── application.yml
│   │   └── pom.xml
│   │
│   ├── ai-service/                    ← Python FastAPI
│   │   ├── app/
│   │   │   ├── api/                   ← gRPC 服务实现
│   │   │   ├── services/              ← AI 业务逻辑
│   │   │   │   ├── extraction.py      ← 知识提取引擎
│   │   │   │   ├── chat.py            ← 对话服务
│   │   │   │   ├── rag.py             ← RAG 检索
│   │   │   │   └── embedding.py       ← 向量化
│   │   │   ├── prompts/               ← Prompt 模板
│   │   │   │   ├── extraction.py
│   │   │   │   └── conflict.py
│   │   │   └── core/
│   │   │       ├── config.py
│   │   │       └── clients.py         ← Claude API, Qdrant 客户端
│   │   ├── proto/                     ← protobuf 定义
│   │   │   └── knowledge_ai.proto
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── frontend/                      ← 前端 Monorepo
│   │   ├── packages/
│   │   │   ├── shared/                ← 共享代码
│   │   │   │   ├── types/
│   │   │   │   ├── api-client/
│   │   │   │   ├── stores/            ← Zustand
│   │   │   │   ├── hooks/
│   │   │   │   └── utils/
│   │   │   ├── web/                   ← Next.js Web 端
│   │   │   │   ├── app/               ← App Router 页面
│   │   │   │   ├── components/
│   │   │   │   └── ...
│   │   │   └── mobile/                ← React Native App 端
│   │   │       ├── app/               ← Expo Router
│   │   │       ├── components/
│   │   │       └── ...
│   │   ├── package.json
│   │   └── turbo.json
│   │
│   └── proto/                         ← 共享 protobuf 定义
│       └── knowledge_ai.proto
│
├── docker/                            ← Docker 配置
│   ├── docker-compose.yml
│   ├── postgres/
│   │   └── init.sql
│   └── qdrant/
│       └── config.yaml
│
├── docs/                              ← 文档
│   └── superpowers/
│       └── specs/
│           └── 2026-06-11-komo-design.md
│
└── .gitignore
```

---

## 三、数据模型

### 3.1 实体关系图

```
┌──────────┐       ┌──────────┐       ┌──────────┐
│   User   │1────*│ Knowledge │*────*│   Tag    │
│          │      │  Entry   │       │          │
└──────────┘      │          │       └──────────┘
     │            │ • id     │
     │            │ • title  │       ┌──────────┐
     │            │ • content│*────*│Knowledge │
     │            │ • source │       │  Link    │
     │            │ • type   │       │(自关联)  │
     │            │ • status │       └──────────┘
     ▼            └────┬─────┘
┌──────────┐           │ belongs to
│Category  │◄──────────┘
│(树形结构)│
└──────────┘
     │
     │            ┌──────────┐       ┌──────────┐
     │            │Conversat.│1────*│ Message  │
     └───────────►│          │      │          │
                  └────┬─────┘      └──────────┘
                       │
                       │ extracts
                       ▼
                  ┌──────────┐
                  │Knowledge │
                  │ Draft    │
                  │          │
                  │ • content│
                  │ • confidence (0-1)
                  │ • relation_type
                  │ • status
                  └──────────┘
```

### 3.2 核心表设计

**knowledge_entries** — 知识条目

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID (PK) | 主键 |
| user_id | UUID → users (NOT NULL) | 所有者 |
| workspace_id | UUID (NULLABLE) | 预留扩展点，个人版 = user_id |
| title | VARCHAR(500) | 知识标题 |
| content | TEXT | Markdown 格式 |
| content_plain | TEXT | 纯文本（用于全文搜索、向量化） |
| source | ENUM('manual','ai_extract','import') | 来源 |
| entry_type | ENUM('fact','concept','insight','method','question') | 知识类型 |
| status | ENUM('draft','published','archived') | 状态 |
| category_id | UUID → categories | 所属分类 |
| embedding_id | UUID | Qdrant 向量 ID |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| deleted_at | TIMESTAMP (NULLABLE) | 软删除标记 |

**knowledge_links** — 知识关联（自引用多对多）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID (PK) | 主键 |
| source_entry_id | UUID → knowledge_entries | 源知识 |
| target_entry_id | UUID → knowledge_entries | 关联知识 |
| relation | ENUM('related','extends','contradicts','supplements') | 关系类型 |
| created_at | TIMESTAMP | 创建时间 |

**知识条目和知识链接均有安全约束**：关联操作必须验证两端条目的 `user_id` 归属，防止跨用户关联攻击。

**knowledge_drafts** — AI 提取的知识草稿

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID (PK) | 主键 |
| conversation_id | UUID → conversations | 来源对话 |
| message_id | UUID → messages | 来源消息 |
| title | VARCHAR(500) | 拟议标题 |
| content | TEXT | Markdown 格式 |
| source_quote | TEXT | AI回复原文引用 |
| confidence | FLOAT | AI 置信度 (0-1) |
| relation_type | ENUM('new','supplements','contradicts','duplicate') | 与库内关系 |
| relation_detail | JSON (NULLABLE) | 关系详情 |
| status | ENUM('pending','confirmed','edited','rejected') | 处理状态 |
| confirmed_entry_id | UUID → knowledge_entries (NULLABLE) | 确认后关联 |
| created_at | TIMESTAMP | 创建时间 |
| processed_at | TIMESTAMP (NULLABLE) | 处理时间 |

**conversations** — 对话会话

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID (PK) | 主键 |
| user_id | UUID → users | 所有者 |
| title | VARCHAR(500) | 会话标题 |
| created_at / updated_at | TIMESTAMP | 时间戳 |

**messages** — 对话消息

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID (PK) | 主键 |
| conversation_id | UUID → conversations | 所属会话 |
| role | ENUM('user','assistant') | 角色 |
| content | TEXT | 消息内容 |
| tokens_used | INT | 消耗 token 数 |
| created_at | TIMESTAMP | 时间戳 |

**categories** — 分类（PostgreSQL ltree 树形结构）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID (PK) | 主键 |
| user_id | UUID → users | 所有者 |
| name | VARCHAR(200) | 分类名 |
| path | LTREE | 树形路径（如 `root.science.physics`） |
| sort_order | INT | 排序 |

---

## 四、API 设计

### 4.1 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "timestamp": 1718000000000
}
```

认证：`Authorization: Bearer <JWT_ACCESS_TOKEN>`

### 4.2 知识条目 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/knowledge` | 列表 `?category=&tag=&q=&page=&size=` |
| `GET` | `/api/knowledge/{id}` | 详情 |
| `POST` | `/api/knowledge` | 创建 |
| `PUT` | `/api/knowledge/{id}` | 更新 |
| `DELETE` | `/api/knowledge/{id}` | 软删除 |
| `GET` | `/api/knowledge/{id}/links` | 关联知识 |
| `POST` | `/api/knowledge/{id}/links` | 添加关联（校验两端归属） |
| `DELETE` | `/api/knowledge/{id}/links/{linkId}` | 移除关联 |

### 4.3 分类 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/categories` | 树形结构 |
| `POST` | `/api/categories` | 创建 `{name, parentId?}` |
| `PUT` | `/api/categories/{id}` | 重命名/移动 |
| `DELETE` | `/api/categories/{id}` | 删除（子分类需先清空） |

### 4.4 对话 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/conversations` | 会话列表 |
| `POST` | `/api/conversations` | 新建会话 |
| `GET` | `/api/conversations/{id}/messages` | 消息历史 |
| `POST` | `/api/conversations/{id}/messages` | 发送消息 → 返回 SSE 流 |

SSE 事件流：

```typescript
type SSEEvent =
  | { type: "token"; data: string; index: number }
  | { type: "status"; status: "extracting" | "done" }
  | { type: "done"; messageId: string; draftCount: number }
```

草稿不通过 SSE 推送，后台静默提取后存入 `knowledge_drafts` 表。前端对话页底部显示轻量提示"💡 本条回复发现 N 个知识点 [查看] [忽略]"。

### 4.5 知识草稿 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/drafts` | 待处理列表 `?status=pending&page=&size=` |
| `POST` | `/api/drafts/{id}/confirm` | 确认入库 |
| `PUT` | `/api/drafts/{id}` | 编辑后确认 |
| `POST` | `/api/drafts/{id}/reject` | 驳回 |
| `POST` | `/api/drafts/batch-confirm` | 批量确认 |
| `POST` | `/api/drafts/batch-reject` | 批量驳回 |

### 4.6 用户 API

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/auth/register` | 注册 |
| `POST` | `/api/auth/login` | 登录，返回 JWT |
| `POST` | `/api/auth/refresh` | 刷新 token |
| `GET` | `/api/user/profile` | 获取个人信息 |
| `PUT` | `/api/user/profile` | 更新个人信息 |
| `GET` | `/api/user/export` | 导出全部知识 (JSON) |

### 4.7 gRPC 接口（Java ↔ Python）

```protobuf
service KnowledgeAI {
  rpc Chat(ChatRequest) returns (stream ChatResponse);
  rpc ExtractKnowledge(ExtractRequest) returns (ExtractResponse);
  rpc DetectRelations(RelationRequest) returns (RelationResponse);
  rpc Embed(EmbedRequest) returns (EmbedResponse);
}
```

### 4.8 一次完整对话的调用时序

```
用户发送消息
      │
      ▼
┌─────────┐    gRPC Chat     ┌──────────┐    HTTP     ┌───────────┐
│  Java   │ ───────────────► │  Python  │ ──────────► │ Claude API│
│         │                  │          │              │           │
│         │  ◄── stream ──── │          │  ◄─ stream ── │           │
│  SSE ───┼──► 前端 (逐字渲染)  │          │              │           │
│         │                  │          │              │           │
│         │  回复完成，Python 静默执行:  │              │           │
│         │  ◄── 知识提取 → Claude API  │              │           │
│         │  ◄── 冲突检测 → Qdrant 向量搜索            │           │
│         │  ◄── 去重+质量过滤          │              │           │
│         │                  │          │              │           │
│ 写入 knowledge_drafts      │          │              │           │
│ 写入 messages              │          │              │           │
│ SSE done → 前端显示提示     │          │              │           │
└─────────┘                  └──────────┘              └───────────┘
```

---

## 五、知识提取引擎设计

### 5.1 多层过滤策略

```
第1层 → AI 自评置信度
  confidence < 0.6 → 直接丢弃

第2层 → 去重
  与本次对话已生成的草稿做语义相似度 > 0.85 → 合并

第3层 → 用户确认
  pending → 用户 confirm/edit/reject

第4层 → (延后) 知识演化追踪
  同一知识多次被修改时记录版本历史
```

### 5.2 知识类型标注

| AI 判断 | 用户看到的标注 |
|---|---|
| `NEW` | 🆕 **新知** — 你知识库中的新领域 |
| `SUPPLEMENTS` | 🔗 **关联** — 与你已有的「X」相关 |
| `CONTRADICTS` | ⚠️ **存疑** — 与你已有的「X」存在矛盾，请核实 |
| `DUPLICATE` | 自动丢弃 |

### 5.3 三层提取入口

| 入口 | 触发方式 | 适用场景 |
|---|---|---|
| **自动静默** | 每条 AI 回复完成后自动执行 | 无遗漏覆盖 |
| **消息操作** | 用户对某条 AI 消息点击"提取知识" | 觉得有价值，主动要求 |
| **全局草稿页** | `/drafts` 页集中处理 | 批量确认/驳回 |

**核心设计原则**：系统始终自动提取（不丢知识），但不强制推送（不打断思考）。提取结果静默存入草稿列表，对话页仅显示轻量提示。

---

## 六、前端设计

### 6.1 Web 端路由

```
/login                          → 登录页
/register                       → 注册页
/knowledge                      → 知识库主页（列表+搜索）
/knowledge/[id]                 → 知识条目详情
/knowledge/[id]/edit            → 编辑知识条目
/knowledge/create               → 新建知识条目
/conversations                  → 对话列表
/conversations/[id]             → 对话详情（核心交互页）
/drafts                         ← 待处理知识草稿
/categories                     → 分类管理
/settings                       → 个人设置
```

### 6.2 核心组件：ConversationPage

```
ConversationPage (/conversations/[id])
├── MessageList
│   ├── UserMessage (右对齐气泡)
│   └── AIMessage (左对齐，Markdown渲染+流式输出)
├── MessageInput (发送消息框)
├── KnowledgeHintBar ← 轻量提示："💡 发现N个知识点 [查看] [忽略]"
└── DraftPanel (点击[查看]后展开的侧边面板)
    ├── DraftCard[]
    └── DraftActionButtons (确认/编辑/驳回)
```

### 6.3 共享层（Web + App 共用）

```
packages/shared/
├── types/          ← 类型定义 (100%复用)
├── api-client/     ← API 封装 (100%复用)
├── stores/         ← Zustand 状态管理 (90%复用)
├── hooks/          ← 数据获取逻辑 (80%复用)
└── utils/          ← 工具函数 (100%复用)
```

### 6.4 Vue → React 对照（供代码审阅参考）

| Vue 概念 | React 对应 |
|---|---|
| `ref` / `reactive` | `useState` / `useRef` |
| `computed` | `useMemo` |
| `watch` | `useEffect` |
| `v-if` | 三元表达式 |
| `v-for` | `.map()` |
| `props` | `props` |
| `emit` | callback prop |
| `provide/inject` | Context API |
| Pinia / Vuex | Zustand |

---

## 七、安全设计

### 7.1 鉴权与令牌

| 措施 | 实现 |
|---|---|
| Access Token | JWT，15分钟有效期 |
| Refresh Token | JWT，7天有效期，httpOnly cookie |
| 密码存储 | BCrypt 哈希 |

### 7.2 数据归属安全（水平越权防护）

**核心原则**：所有数据访问必须经过 `user_id` 校验，不依赖 ID 不可猜测性（UUID）。

```java
// Repository 层强制过滤
@Repository
public interface KnowledgeRepository extends JpaRepository<KnowledgeEntry, UUID> {
    // 必须使用此方法，禁止直接用 findById
    Optional<KnowledgeEntry> findByIdAndUserId(UUID id, UUID userId);
    
    // 跨实体操作验证两端归属
    @Query("SELECT k FROM KnowledgeEntry k WHERE k.id IN (:ids) AND k.userId = :userId")
    List<KnowledgeEntry> findAllByIdsAndUserId(List<UUID> ids, UUID userId);
}
```

**Java 侧封装 BaseService 抽象基类**，所有 CRUD 自动注入当前用户 ID：

```java
public abstract class BaseService<T> {
    protected abstract UUID getOwnerId(T entity);
    
    public T findById(UUID id) {
        T entity = repository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException());
        if (!getOwnerId(entity).equals(SecurityContext.getCurrentUserId())) {
            throw new AccessDeniedException();
        }
        return entity;
    }
}
```

**knowledge_links 额外校验**：创建关联时必须验证 `source_entry_id` 和 `target_entry_id` 的 `user_id` 均为当前用户，防止跨用户关联攻击。

**knowledge_drafts 关联链校验**：验证 `draft.message_id → message.conversation_id → conversation.user_id == currentUserId`，链路中每一步都做归属检查。

### 7.3 Qdrant 多租户隔离

Qdrant 无内置用户隔离机制。采用 **Payload 过滤方案**：

- 每个向量点存储时附带 `{user_id: "xxx"}`
- 每次查询/搜索时自动注入 `filter: {must: [{key: "user_id", match: {value: userId}}]}`
- Qdrant 不映射宿主机端口，仅容器内网访问

### 7.4 网络安全

| 措施 | 说明 |
|---|---|
| CORS | 仅允许 Web 前端来源域名 |
| 速率限制 | AI 对话接口每用户每分钟最多 10 次 |
| 输入校验 | Bean Validation (`@NotNull`, `@Size`, `@Pattern`) |
| XSS 防御 | Markdown 渲染前 sanitize（DOMPurify），后端存原始 MD |
| 日志脱敏 | AOP 切面自动脱敏 token、密码等敏感字段 |
| 数据库/向量库 | 不映射到宿主机端口，仅容器内网通信 |

### 7.5 JWT 安全最佳实践

- Access Token 短有效期（15min），降低泄露风险
- Refresh Token 存储在 httpOnly、Secure、SameSite=Strict cookie
- 登出时服务端将 Refresh Token 加入黑名单（Redis 缓存）
- Token 中仅存 `userId`，不存密码哈希或其他敏感信息

---

## 八、错误处理设计

### 8.1 全局错误码

| 错误码 | 说明 |
|---|---|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或 token 过期 |
| 403 | 无权访问 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 429 | 请求过于频繁 |
| 500 | 服务内部错误 |
| 10001 | 知识条目不存在 |
| 10002 | 分类下有子分类，无法删除 |
| 10003 | 草稿已处理 |
| 10004 | 向量化失败 |
| 10005 | AI 服务响应超时 |
| 10006 | 知识提取失败 |

### 8.2 各层异常处理

```
前端
├── API Client: 拦截器统一处理 401→跳转登录, 500→通用错误提示
├── 组件层: ErrorBoundary 包裹关键页面，防止白屏
└── SSE: 断线自动重连 (指数退避，最多3次)

Java 后端
├── Controller: @ControllerAdvice 全局异常处理器
├── Service: 业务异常抛出，事务自动回滚
└── gRPC调用: Python 不可用时降级返回 "AI服务暂时不可用"

Python AI
├── Claude API: 重试最多2次，间隔1s
├── 知识提取失败: 返回空草稿列表，不阻塞对话
├── Qdrant 不可用: RAG 降级为不引用知识库
└── 超时: 提取30s，回答60s
```

---

## 九、测试策略

### 9.1 测试金字塔

| 层 | 占比 | 工具 | 测什么 |
|---|---|---|---|
| 单元测试 | 80% | JUnit 5 + Mockito / pytest / Vitest | 业务逻辑、各语言独立单元 |
| 集成测试 | 15% | Spring Boot Test + Testcontainers / pytest + docker | API 全链路、gRPC 通信、数据库 |
| E2E | 5% | Playwright | 核心用户流程 |

### 9.2 核心 E2E 用例

1. **知识闭环**：注册→创建知识→AI对话→查看草稿→确认入库→搜索→查看关联
2. **草稿处理**：AI对话→自动生成草稿→确认/编辑确认/驳回→验证状态计数
3. **SSE流式对话**：发送消息→逐字渲染→回复完成后不弹出草稿→底部提示"发现N个知识点"

---

## 十、MVP 范围

### 10.1 MVP 包含

- 知识条目 CRUD、Markdown 编辑/预览、分类树、标签
- 全文搜索（PostgreSQL）、知识关联（手动）
- AI 对话（流式输出）、RAG 检索增强
- 知识自动提取（静默→轻量提示→草稿页处理）
- 新知标注、冲突检测（与库内对比）
- 用户注册/登录（JWT）、数据 JSON 导出
- Web 端完整功能 + App 端核心功能（对话+知识浏览）

### 10.2 MVP 开发顺序

```
Phase 1: Java后端 + 知识库CRUD + 用户系统          (~3-4周)
Phase 2: Python AI微服务 + AI对话 + RAG             (~3-4周)
Phase 3: 知识提取引擎 + 冲突检测 + 新知标注         (~3-4周)
Phase 4: Web前端完整功能                             (~3-4周)
Phase 5: App前端 (React Native) + 双端联调          (~3-4周)
```

---

## 十一、未来路线图（MVP 后参考）

### 11.1 功能增强

- [ ] 知识图谱可视化 — D3/Canvas 渲染知识关联网络图
- [ ] 主动推荐引擎 — 基于知识图谱分析用户的认知盲区，主动推荐学习方向
- [ ] 外部知识探索 — 输入主题自动搜索全网资料并提取结构化知识
- [ ] 跨领域类比 — 将A领域的模式映射到B领域产生洞见
- [ ] 知识版本演进追踪 — 记录同一知识点随时间的认知变化
- [ ] 富文本编辑器 — 图片、表格、代码块等

### 11.2 基础设施

- [ ] Redis 缓存层 — 会话缓存、任务队列、速率限制
- [ ] Elasticsearch — 替换 PostgreSQL 全文搜索，支持语义+关键词混合搜索
- [ ] 对象存储 (OSS/S3) — 替换本地文件存储
- [ ] 异步提取方案 — WebSocket 推送，解放同步 SSE 连接
- [ ] 自部署指南 — 开源发布时需要的一键部署文档

### 11.3 产品与商业化

- [ ] 团队协作 / 多用户 workspace → 付费点
- [ ] 插件系统 → 社区生态
- [ ] 多 AI 模型切换 → 按模型付费
- [ ] PDF/网页剪藏 → 信息来源扩展
- [ ] 付费系统 → Freemium（知识条目数/AI调用量限制）
- [ ] 知识版本历史 → 高级功能

---

## 十二、验证清单

- [ ] docker-compose up 一键启动所有基础设施
- [ ] Java 后端启动并响应 `/api/health`
- [ ] Python AI 服务启动并与 Java gRPC 握手成功
- [ ] 用户注册 → 登录 → 获取 JWT → 访问受保护接口
- [ ] 知识 CRUD 全流程 + 归属校验
- [ ] AI 对话 → 流式渲染 → 静默提取 → 草稿生成 → 确认入库
- [ ] 知识库搜索语义检索
- [ ] 数据导出 JSON
- [ ] 各层单元测试 + 集成测试通过
