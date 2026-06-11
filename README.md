# KOMO — Knowledge On My Own

> AI 驱动的个人知识管理工具。不仅能用你的知识回答问题，还能从回答中帮你发现你不知道自己不知道的东西。

<p align="center">
  <strong>🔗 对话 → 提取 → 积累 → 增强对话 → 打破认知边界</strong>
</p>

---

## 核心理念

传统知识管理工具是"手动录入 → 整理分类 → 搜索查阅"。KOMO 把这个流程反转了：

1. **你和 AI 对话**，像和朋友聊天一样自然
2. **AI 回复的同时**，系统自动从回复中提取结构化知识点
3. **你在草稿箱确认/编辑/驳回**，而不是被强制中断阅读
4. **知识入库后**，下次对话时 AI 自动引用你的知识库提供个性化回答

这个"反向知识提取"循环让你在不知不觉中积累知识，而不是把"整理知识"变成一种负担。

### 和 Notion AI / ChatGPT 的区别？

| | Notion AI | ChatGPT | KOMO |
|---|---|---|---|
| 知识来源 | 手动录入 | 对话中产生但无法沉淀 | **对话中自动提取入库** |
| 知识复用 | 手动搜索引用 | 每次重新提问 | **下次对话自动 RAG 增强** |
| 新知发现 | 无 | 无 | **标注知识库中缺失的领域** |

---

## 技术架构

```
React (Next.js 16) + React Native (Expo)  ←  Web + App 前端
         │ REST + SSE
Java Spring Boot 3 (:8081)               ←  业务逻辑、认证、CRUD
         │ HTTP
Python FastAPI (:8001, Docker)           ←  AI 对话、知识提取、RAG
         │
PostgreSQL (:5434) + Qdrant (:6333)     ←  数据 + 向量搜索
```

**三语言架构**：Java 做高并发业务逻辑、Python 做 AI/ML、TypeScript 做跨平台前端。Python 运行在 Docker 中隔离。

### 技术栈

| 层 | 技术 |
|---|---|
| Web 前端 | Next.js 16 (Turbopack), TypeScript, Radix UI, CSS Modules |
| App 前端 | React Native 0.76+ / Expo SDK 52+ |
| 后端 | Java 21 + Spring Boot 3.2, Spring Security (JWT), JPA + Hibernate |
| AI 服务 | Python 3.12 + FastAPI, DeepSeek V3, OpenAI-compatible SDK |
| 数据库 | PostgreSQL 16 (ltree 树形分类), Qdrant (向量搜索) |
| 基础设施 | Docker Compose, Nginx |

---

## 核心功能

### 已完成 (MVP)

- ✅ **AI 对话** — DeepSeek V3 驱动，SSE 流式输出，Markdown 渲染
- ✅ **知识自动提取** — AI 回复后静默提取知识点，置信度过滤
- ✅ **草稿管理** — 确认入库 / 编辑后入库 / 驳回 / 批量操作
- ✅ **知识 CRUD** — Markdown 编辑 + 实时预览，全文搜索
- ✅ **RAG 检索增强** — 对话中自动注入相关知识库内容
- ✅ **用户系统** — JWT 双 Token (Access 15min / Refresh 7d)
- ✅ **数据安全** — 全链路 `user_id` 校验，Qdrant 多租户过滤

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
# 编辑 docker/.env，填入你的 DeepSeek API Key 等信息
```

### 3. 启动基础设施

```bash
cd docker
docker-compose up -d
# 启动 PostgreSQL + Qdrant + Python AI 服务
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
│           ├── web/                # Next.js Web 端
│           └── mobile/             # React Native App 端
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

### 为什么选择 AGPL v3？

AGPL v3 是"网络服务版"的 GPL —— 它要求**任何基于此代码运行的公开网络服务，必须同时开源其修改后的源代码**。这意味着：

- **个人使用**：完全自由，没有任何限制
- **修改和分发**：可以修改，但修改后的代码也必须以 AGPL v3 开源
- **作为服务运营**：如果你基于 KOMO 修改后提供公开的托管服务，你必须开源你的修改
- **商业授权**：作为版权持有人，我们可以为不愿接受 AGPL 条款的客户提供单独的商用授权

这个模式是 **GitLab、Grafana、MinIO** 等成功开源商业化项目的共同选择。它既保护了社区的开放性，也为未来的商业化保留了路径。

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
