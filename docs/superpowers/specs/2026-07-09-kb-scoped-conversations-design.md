# KB-Scoped Conversations + Quote-to-Chat — Design Spec

**Date:** 2026-07-09
**Status:** Approved
**Related commits:** `fb76a41` (autoExtract preference)

## Summary

Two major features for the KOMO conversation system:

1. **KB-scoped conversations** — Each conversation is optionally tied to a specific Knowledge Base, similar to Claude Code's working directory. Sidebar groups conversations by KB. Conversations with no KB do NOT extract knowledge (even in silent autoExtract mode).

2. **Quote-to-chat** — Users can select text in a knowledge article, right-click "追问 KOMO", and jump to a new conversation pre-filled with the quoted text and source reference.

## Feature 1: KB-Scoped Conversations

### Data Model

**Conversation entity — new field:**

```java
@Column(name = "knowledge_base_id")
private UUID knowledgeBaseId;  // null = no-KB conversation
```

- `knowledgeBaseId = null` — No-KB conversation. Extraction is ALWAYS skipped, even when autoExtract is true.
- `knowledgeBaseId = <kb_id>` — Belongs to that KB. Extraction targets that KB's drafts.

### Backend API

| Method | Endpoint | Change |
|--------|----------|--------|
| `POST` | `/api/conversations` | Accept optional `knowledgeBaseId` in request body |
| `PUT` | `/api/conversations/{id}/kb` | **New** — switch conversation KB. Body: `{ knowledgeBaseId: UUID \| null }`. Only affects future messages. |
| `GET` | `/api/conversations` | Accept optional `?kb=<id>` filter; returns all if omitted |
| `POST` | `/api/conversations/{id}/messages/stream` | No change |

**PUT /api/conversations/{id}/kb validation:**
- Conversation must belong to current user (ownership check)
- `knowledgeBaseId` must belong to current user (or be null for no-KB)
- Returns updated Conversation

### Extraction Logic

```
enqueueExtractionIfAuto(userId, conversationId, ...):
  1. Load conversation
  2. If conversation.knowledgeBaseId == null → SKIP (no-KB, no extraction ever)
  3. If user.autoExtract == false → SKIP
  4. Enqueue extraction with targetKb = conversation.knowledgeBaseId
```

- Manual extraction (`triggerExtraction`) is also prevented for no-KB conversations — returns 400 with message "无知识库对话不支持知识提取".
- The `extractAndSaveDrafts` method uses `conversation.knowledgeBaseId` as default target KB instead of always using DEFAULT.

### Data Migration

```sql
-- All existing conversations → user's DEFAULT KB
UPDATE conversations c
SET knowledge_base_id = (
  SELECT kb.id FROM knowledge_bases kb
  WHERE kb.user_id = c.user_id AND kb.type = 'DEFAULT'
  LIMIT 1
)
WHERE knowledge_base_id IS NULL;
```

Run as a Flyway/Liquibase migration or manual SQL during deploy.

### Frontend: Sidebar

**Tree structure (KB → conversations):**

```
┌─ 侧边栏 ───────────────────────────────────────┐
│  [+ 新对话 ▾]                                   │
│                                                 │
│  📁 我的知识库                        [+ 对话]   │
│     💬 Spring Boot学习笔记                       │
│     💬 微服务架构讨论                            │
│  📁 知识碎片                          [+ 对话]   │
│     💬 零散想法收集                              │
│  📁 学习笔记 (自定义KB)               [+ 对话]   │
│     (空)                                        │
│  ────────────────────────────────────           │
│  📄 无知识库对话                      [+ 对话]   │
│     💬 随便聊聊                                 │
│     💬 测试功能                                 │
└────────────────────────────────────────────────┘
```

**Interactions:**
- **Top [+ 新对话 ▾]** — Dropdown: pick a KB first (or "无知识库"), then create conversation. Redirects to the new conversation.
- **KB-section [+ 对话]** — Creates conversation directly under that KB. Redirects to the new conversation.
- **KB sections are collapsible** — Click KB name to toggle child conversation list. Expanded by default for KBs that have conversations.
- **Conversation item right-click** — Context menu: "移动到其他 KB" / "删除".
- **No-KB section** — Fixed at bottom, separated by divider, always visible.
- **Current conversation highlighted** — Selected item has active style.

**Sorting:**
- KBs by `sortOrder` ascending
- Conversations within each KB by `updatedAt` descending
- No-KB section always last

**Data fetching:**
- `GET /api/conversations` (no filter) — returns all conversations with their KB info
- Frontend groups them client-side by `knowledgeBaseId`
- Also fetch `GET /api/knowledge-bases` to get KB names and sort order
- No-KB conversations grouped under a synthetic "无知识库" section

### Frontend: Conversation Page Header

```
┌─ 对话 header ──────────────────────────────────────────────────┐
│  📁 我的知识库 ▾    Spring Boot学习笔记    [autoExtract? 提取]  │
└────────────────────────────────────────────────────────────────┘
```

- **KB dropdown** — Shows current KB name. Click to switch to another KB or "无知识库".
- **Dropdown options:**
  - "我的知识库" (with icon)
  - "知识碎片" (with icon)
  - ... (other user KBs)
  - "─────" (divider)
  - "📄 无知识库" (grey text)
- **On switch:** calls `PUT /api/conversations/{id}/kb`, on success:
  - Header KB name updates immediately
  - Sidebar refreshes to reflect the move
  - A system message `📌 对话已切换至「xxx」` appears in the chat
  - Toast notification shown
- **Disabled state:** If current KB is "无知识库", the label shows grey `📄 无知识库`, and the manual "提取知识" button is completely hidden (not disabled, hidden).

### No-KB Conversation Behavior

- Auto-extraction: **NEVER** runs, regardless of user's autoExtract preference
- Manual extraction button: **HIDDEN** (user cannot trigger it manually either)
- RAG context: Normal ES retrieval still works (conversation context is independent of KB)
- Conversation title: Generated as normal from first message

## Feature 2: Quote-to-Chat

### Interaction Flow

```
User on article detail page (/knowledge/[id])
  │
  ├─ Selects text in the MarkdownRenderer area
  │
  ├─ Right-clicks → custom context menu appears with "💬 追问 KOMO"
  │   (Only if selection length ≥ 5 characters)
  │
  ├─ Clicks "💬 追问 KOMO"
  │
  ├─ POST /api/conversations { knowledgeBaseId, title: first 20 chars }
  │
  ├─ Redirects to /conversations/{newId}?quote=<encoded>&source=<title>&sourceId=<id>
  │
  └─ Conversation page reads query params, pre-fills input:
      ┌──────────────────────────────────────────┐
      │ > 选中的原文内容...                         │
      │ > 来源：[文章标题]                           │
      │                                           │
      │ （光标在此，用户编辑后发送）                  │
      └──────────────────────────────────────────┘
```

### Frontend Implementation

**Article page (`/knowledge/[id]`):**
- Add `onContextMenu` handler on the MarkdownRenderer container
- Check `window.getSelection().toString().length >= 5`
- Prevent default browser context menu, show custom menu
- Custom menu: absolute-positioned `<div>` near cursor, with single item "💬 追问 KOMO"
- On click outside → dismiss menu

**Custom context menu component:**
- Simple positioned `<div>` with one menu item
- Click outside or Escape dismisses
- Menu item calls `createConversation({ knowledgeBaseId, title: quote.slice(0, 20) })`

**Conversation page (`/conversations/[id]`):**
- Check for `?quote=` and `?source=` query params in `useEffect`
- If present, set `input` state to the formatted quote text
- Focus the input automatically
- Clear query params from URL after reading (to prevent re-fill on refresh)

### Quote Format

```
> {quoted text}
> 来源：{article title}

（user types their question here）
```

- The `>` prefix renders as blockquote in Markdown when sent to AI
- The source line helps AI understand context

### Edge Cases

- **Article is in a KB:** New conversation inherits that KB's `knowledgeBaseId`
- **Article is in fragments KB:** Same, inherits fragments KB
- **No KB article (should not happen):** Falls back to no-KB
- **Very long selection (>500 chars):** Truncate to first 500 chars with "…" suffix in the pre-fill
- **Selection has no KB context (e.g., from search page):** Create as no-KB conversation

## Implementation Order

1. **Database + Entity** — Add `knowledge_base_id` column, migration script, entity field
2. **Backend API** — Update create/list endpoints, add switch-KB endpoint, fix extraction logic
3. **Sidebar** — Rebuild conversation list with KB grouping
4. **Conversation header** — Add KB dropdown switcher
5. **Quote-to-chat** — Article page right-click menu + conversation page param handling

## Not in Scope

- Reordering conversations within a KB (drag-and-drop)
- Conversation sharing between users
- KB-level permissions
- Auto-creating KBs from conversation topics
- Batch moving conversations between KBs
