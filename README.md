# KOMO — Knowledge On My Own

> 通过有依据的AI对话读懂自己的文档，再用自己的理解完善它。

## 核心流程

1. 导入Markdown文档，或自己创建和编辑文章。
2. 打开文章的阅读问答，围绕全文或选中的原文提问。
3. 展开回答使用的参考片段，核对原文、适用条件和例外。
4. 理解之后，由用户自行编辑文档；AI不会自动保存生成内容。

文档阅读核心已从Java提示词中独立为可离线评测的Python模块。短文优先全文输入，长文使用BM25与本地embedding混合召回，回答保留原文证据快照。普通聊天也使用同一检索层；ES已移除。当前尚未实现自主工具循环。详见[阅读核心](KOMO/ai-service/READING_CORE.md)与[混合检索架构和接入](KOMO/ai-service/RETRIEVAL.md)。

旧草稿提取流程默认暂停，已有草稿可在设置中查看和处理。

---

## 技术架构

```
React (Next.js 16)                       ←  Web 前端
         │ REST + SSE
Java Spring Boot 3 (:8081)               ←  业务逻辑、认证、CRUD、阅读消息持久化
         │ HTTP                          │ AMQP
Python FastAPI (:8001, Docker)           ←  阅读核心、证据选择、模型调用、离线评测
         │                               ↓
PostgreSQL (:5434) + Qdrant (:6333) + RabbitMQ（旧草稿流程暂停）
         数据存储        片段与向量检索    旧提取队列（默认暂停）
```

Java保留业务与权限边界，Python负责文档阅读策略和模型适配，TypeScript负责共享界面。语言选择不代表已达到高并发或高可用。

### 技术栈

| 层 | 技术 |
|---|---|
| Web 前端 | Next.js 16 (Turbopack), TypeScript, Radix UI, CSS Modules |
| 后端 | Java 21 + Spring Boot 3.2, Spring Security (JWT), JPA + Hibernate |
| AI 服务 | Python 3.12 + FastAPI, DeepSeek V3, OpenAI-compatible SDK |
| 数据库 | PostgreSQL 16 (ltree 树形分类), Qdrant 1.15.1 (向量与版本片段) |
| 基础设施 | Docker Compose, RabbitMQ, Nginx |

---

## 核心功能

### 已完成 (MVP)

- ✅ **AI 对话** — DeepSeek V3 驱动，SSE 流式输出，Markdown 渲染
- **历史草稿** — 保留已有数据和确认/驳回能力；新提取默认暂停
- ✅ **知识 CRUD** — Markdown 编辑 + 实时预览，全文搜索
- ✅ **RAG 检索增强** — 对话中自动注入相关知识库内容
- ✅ **文档阅读问答** — 独立Python阅读核心、原文片段与行号、文档快照、流式输出；用户自行编辑文档
- ✅ **[[双向链接]]** — Obsidian 式 `[[文章标题]]` 引用，保存时自动建链，正文可点击跳转，页脚展示"引用了 / 被引用于"
- ✅ **用户系统** — JWT 双 Token (Access 1h / Refresh 7d)，httpOnly Cookie + CSRF 防护
- ✅ **数据安全** — 全链路 `user_id` 归属校验，检索用户/版本过滤与原文复核

### 路线图

- [ ] 知识图谱可视化 — D3/Canvas 渲染知识关联网络
- [ ] 跨领域类比发现 — 将 A 领域的模式映射到 B 领域
- [ ] 知识版本演进追踪 — 记录同一知识随时间的认知变化
- [ ] 外部知识探索 — 输入主题自动搜索全网资料并提取
- [ ] 团队协作 / 多用户 Workspace
- [ ] 插件系统 + 社区生态

---

## 快速开始

### 前置要求

- JDK 21, Maven 3.9+
- Node.js 20+, npm 10+
- Docker Desktop
- DeepSeek API Key ([获取地址](https://platform.deepseek.com))

### 1. 克隆项目

```bash
git clone https://github.com/oyuovo/komo.git
cd komo
```

### 2. 配置环境变量

```bash
cp docker/.env.example docker/.env
# 编辑 docker/.env，填入DeepSeek API Key和独立随机AI_INTERNAL_TOKEN
# 启动Java时也须提供同一AI_INTERNAL_TOKEN及数据库环境变量
```

### 3. 启动基础设施

```bash
cd docker
docker-compose up -d
# 启动 PostgreSQL + Qdrant + RabbitMQ + Python AI 服务
```

### 4. 启动后端

```bash
cd KOMO/backend
mvn spring-boot:run
# 启动在 http://localhost:8081
```

### 5. 启动前端

```bash
cd KOMO/frontend
npm install
cd packages/web
npm run dev
# 启动在 http://localhost:3000
```

### 6. 开始使用

打开 `http://localhost:3000`，注册/登录后即可开始对话。

---

## 项目结构

```
komo/
├── KOMO/
│   ├── backend/                    # Java Spring Boot
│   │   └── src/main/java/com/komo/
│   │       ├── controller/         # REST 控制器
│   │       ├── service/            # 业务逻辑
│   │       ├── entity/             # JPA 实体
│   │       ├── repository/         # 数据访问
│   │       └── security/           # JWT 鉴权
│   │
│   ├── ai-service/                 # Python FastAPI
│   │   └── app/
│   │       ├── api/                # API 路由
│   │       ├── services/           # AI 业务 (chat, extraction)
│   │       ├── prompts/            # Prompt 模板
│   │       └── core/               # 配置 & 客户端
│   │
│   └── frontend/                   # 前端 Monorepo
│       └── packages/
│           ├── shared/             # 共享类型 & API 客户端
│           └── web/                # Next.js Web 端
│
├── docker/                         # Docker Compose 配置
│   ├── docker-compose.yml
│   └── python/Dockerfile
│
├── docs/                           # 设计文档
├── LICENSE                         # AGPL v3
└── README.md
```

---

## 开源协议

KOMO 采用 **GNU Affero General Public License v3 (AGPL v3)**。

详细条款见 [LICENSE](LICENSE) 文件。

---

## 贡献

项目目前处于 MVP 阶段，由 [@oyuovo](https://github.com/oyuovo) 独立开发。Issue 和 PR 欢迎提交，但建议先开 Issue 讨论你的想法。

---

## 致谢

- [DeepSeek](https://deepseek.com) — 高性价比的 AI 模型
- [Radix UI](https://www.radix-ui.com) — 无样式 React 行为组件
- [Spring Boot](https://spring.io) — Java 生态最优秀的应用框架
- [FastAPI](https://fastapi.tiangolo.com) — Python 高性能 API 框架

---

<p align="center">
  <sub> Built with ❤️ · AGPL v3 · <a href="https://github.com/oyuovo/komo">GitHub</a></sub>
</p>
