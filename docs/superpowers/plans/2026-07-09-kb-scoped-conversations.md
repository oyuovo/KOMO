# KB-Scoped Conversations + Quote-to-Chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add knowledge-base scoping to conversations (tied to a KB or "no-KB") and add quote-to-chat from article pages.

**Architecture:** Add `knowledge_base_id` column to Conversation entity. Backend enforces no-KB = no extraction. Frontend sidebar groups conversations by KB with tree UI. Conversation page header has a KB switcher dropdown. Article page adds right-click context menu for quoting text into a new conversation.

**Tech Stack:** Java 21 / Spring Boot 3.2 / JPA / PostgreSQL, TypeScript / Next.js 16 / CSS Modules

**Spec:** `docs/superpowers/specs/2026-07-09-kb-scoped-conversations-design.md`

## Global Constraints

- Java: SLF4J logging, `@Valid` on DTOs, `userId` in all repository queries, `@Transactional` on multi-step DB ops
- Frontend: `'use client'` on stateful components, CSS Modules only (no Tailwind), all API calls through `@komo/shared/api-client`
- Never hardcode secrets; JWT_SECRET from env
- No empty catch blocks; log exceptions properly
- Verify with `mvn compile -q` for Java, `npx next build` for frontend

---

### Task 1: Database Migration + Conversation Entity

**Files:**
- Modify: `KOMO/backend/src/main/java/com/komo/entity/Conversation.java:28`
- Create: `KOMO/backend/src/main/resources/db/migration/V2__add_knowledge_base_id.sql` (or manual SQL)

**Interfaces:**
- Produces: `Conversation.knowledgeBaseId` (UUID, nullable)

- [ ] **Step 1: Add field to Conversation entity**

In `Conversation.java`, add after the `title` field:

```java
@Column(name = "knowledge_base_id")
private UUID knowledgeBaseId;  // null = 无知识库对话，不提取知识
```

- [ ] **Step 2: Create migration SQL**

Create `KOMO/backend/src/main/resources/db/migration/V2__add_knowledge_base_id.sql`:

```sql
-- Add knowledge_base_id column to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS knowledge_base_id UUID;

-- Migrate existing conversations to user's DEFAULT KB
UPDATE conversations c SET knowledge_base_id = kb.id
FROM knowledge_bases kb
WHERE c.knowledge_base_id IS NULL
  AND kb.user_id = c.user_id
  AND kb.type = 'DEFAULT';
```

If not using Flyway, run this SQL manually against the PostgreSQL database:

```bash
docker exec -i komo-postgres psql -U komo -d komo < KOMO/backend/src/main/resources/db/migration/V2__add_knowledge_base_id.sql
```

- [ ] **Step 3: Run migration**

```bash
docker exec -i komo-postgres psql -U komo -d komo -c "
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS knowledge_base_id UUID;
UPDATE conversations c SET knowledge_base_id = kb.id
FROM knowledge_bases kb
WHERE c.knowledge_base_id IS NULL AND kb.user_id = c.user_id AND kb.type = 'DEFAULT';
"
```

Expected: "UPDATE N" (N = number of existing conversations).

- [ ] **Step 4: Compile to verify entity change**

```bash
cd KOMO/backend && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add KOMO/backend/src/main/java/com/komo/entity/Conversation.java
git add KOMO/backend/src/main/resources/db/migration/V2__add_knowledge_base_id.sql
git commit -m "feat: add knowledge_base_id to Conversation entity with migration"
```

---

### Task 2: Update ConversationRepository

**Files:**
- Modify: `KOMO/backend/src/main/java/com/komo/repository/ConversationRepository.java`

**Interfaces:**
- Consumes: `Conversation.knowledgeBaseId`
- Produces: `findAllByUserIdAndKnowledgeBaseIdOrderByUpdatedAtDesc(UUID userId, UUID kbId)`

- [ ] **Step 1: Add KB-filtered query method**

In `ConversationRepository.java`, add:

```java
List<Conversation> findAllByUserIdAndKnowledgeBaseIdOrderByUpdatedAtDesc(UUID userId, UUID knowledgeBaseId);
```

Full file:

```java
package com.komo.repository;

import com.komo.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {
    List<Conversation> findAllByUserIdOrderByUpdatedAtDesc(UUID userId);
    List<Conversation> findAllByUserIdAndKnowledgeBaseIdOrderByUpdatedAtDesc(UUID userId, UUID knowledgeBaseId);
    Optional<Conversation> findByIdAndUserId(UUID id, UUID userId);
}
```

- [ ] **Step 2: Compile**

```bash
cd KOMO/backend && mvn compile -q
```

- [ ] **Step 3: Commit**

```bash
git add KOMO/backend/src/main/java/com/komo/repository/ConversationRepository.java
git commit -m "feat: add KB-filtered conversation query to repository"
```

---

### Task 3: Update ConversationService

**Files:**
- Modify: `KOMO/backend/src/main/java/com/komo/service/ConversationService.java`

**Interfaces:**
- Consumes: `ConversationRepository.findAllByUserIdAndKnowledgeBaseIdOrderByUpdatedAtDesc`, `KnowledgeBaseService.findByIdOrThrow`
- Produces: `create(userId, title, knowledgeBaseId)`, `list(userId, kbId?)`, `switchKnowledgeBase(conversationId, userId, knowledgeBaseId)`
- Modifies: `enqueueExtractionIfAuto` (add no-KB guard), `triggerExtraction` (add no-KB guard)

- [ ] **Step 1: Update create() to accept knowledgeBaseId**

Replace the existing `create` method:

```java
/** 创建新对话 */
@Transactional
public Conversation create(UUID userId, String title, UUID knowledgeBaseId) {
    // 如果提供了 knowledgeBaseId，验证归属
    if (knowledgeBaseId != null) {
        knowledgeBaseService.findByIdOrThrow(knowledgeBaseId);
    }
    Conversation convo = Conversation.builder()
        .userId(userId)
        .title(title != null ? title : "新对话")
        .knowledgeBaseId(knowledgeBaseId)
        .build();
    return conversationRepository.save(convo);
}
```

- [ ] **Step 2: Update list() to support optional KB filter**

```java
/** 获取用户的对话列表，可按知识库过滤 */
public List<Conversation> list(UUID userId) {
    return conversationRepository.findAllByUserIdOrderByUpdatedAtDesc(userId);
}

public List<Conversation> listByKnowledgeBase(UUID userId, UUID knowledgeBaseId) {
    return conversationRepository.findAllByUserIdAndKnowledgeBaseIdOrderByUpdatedAtDesc(userId, knowledgeBaseId);
}
```

- [ ] **Step 3: Add switchKnowledgeBase method**

```java
/** 切换对话归属的知识库。只影响后续消息，不回溯提取。 */
@Transactional
public Conversation switchKnowledgeBase(UUID conversationId, UUID userId, UUID knowledgeBaseId) {
    Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));

    // 验证目标 KB 归属
    if (knowledgeBaseId != null) {
        knowledgeBaseService.findByIdOrThrow(knowledgeBaseId);
    }

    convo.setKnowledgeBaseId(knowledgeBaseId);
    Conversation saved = conversationRepository.save(convo);
    log.info("[AUDIT] action=CONVERSATION_SWITCH_KB conversationId={} userId={} newKbId={}",
        conversationId, userId, knowledgeBaseId);
    return saved;
}
```

- [ ] **Step 4: Update enqueueExtractionIfAuto — add no-KB guard**

Replace the method:

```java
/** 用户开启自动提取时入队，手动模式或无KB对话则跳过。 */
private void enqueueExtractionIfAuto(UUID userId, UUID conversationId,
                                      UUID messageId, List<Map<String, String>> aiMessages) {
    try {
        Conversation convo = conversationRepository.findById(conversationId).orElse(null);
        if (convo == null) return;

        // 无知识库对话 — 绝不提取
        if (convo.getKnowledgeBaseId() == null) {
            log.debug("[extraction] 无KB对话，跳过提取 conversationId={}", conversationId);
            return;
        }

        var user = userService.findById(userId);
        if (user.getAutoExtract() != null && !user.getAutoExtract()) {
            log.debug("[extraction] 用户手动模式，跳过自动提取 userId={}", userId);
            return;
        }
        enqueueExtraction(userId, conversationId, messageId, aiMessages);
    } catch (Exception e) {
        log.warn("[extraction] 入队提取任务失败（RabbitMQ 可能未启动）", e);
    }
}
```

- [ ] **Step 5: Update triggerExtraction — add no-KB guard**

Add at the beginning of `triggerExtraction`:

```java
/** 手动触发对话最新消息的提取（供控制器调用）。 */
public void triggerExtraction(UUID conversationId, UUID userId) {
    Conversation convo = conversationRepository.findByIdAndUserId(conversationId, userId)
        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "对话不存在"));

    if (convo.getKnowledgeBaseId() == null) {
        throw new BusinessException(ErrorCode.BAD_REQUEST, "无知识库对话不支持知识提取");
    }

    var messages = messageRepository.findAllByConversationIdOrderByCreatedAtAsc(conversationId);
    // ... rest unchanged
```

- [ ] **Step 6: Compile**

```bash
cd KOMO/backend && mvn compile -q
```

- [ ] **Step 7: Commit**

```bash
git add KOMO/backend/src/main/java/com/komo/service/ConversationService.java
git commit -m "feat: add KB-scoped conversation logic — create/list/switch/extraction guard"
```

---

### Task 4: Update ConversationController

**Files:**
- Modify: `KOMO/backend/src/main/java/com/komo/controller/ConversationController.java`

**Interfaces:**
- Consumes: `ConversationService.create(userId, title, knowledgeBaseId)`, `switchKnowledgeBase()`, `list(userId)`, `listByKnowledgeBase(userId, kbId)`, updated `triggerExtraction()`
- Produces: Updated `GET /api/conversations` (optional ?kb=), updated `POST /api/conversations`, new `PUT /api/conversations/{id}/kb`

New imports needed:
```java
import org.springframework.web.bind.annotation.RequestParam;
```

- [ ] **Step 1: Update list endpoint to support optional KB filter**

Replace the `list` method:

```java
@GetMapping
public ResponseEntity<ApiResponse<List<Conversation>>> list(
    @RequestParam(required = false) UUID kb
) {
    UUID userId = SecurityContext.getCurrentUserId();
    if (kb != null) {
        return ResponseEntity.ok(ApiResponse.success(conversationService.listByKnowledgeBase(userId, kb)));
    }
    return ResponseEntity.ok(ApiResponse.success(conversationService.list(userId)));
}
```

- [ ] **Step 2: Update create endpoint to accept knowledgeBaseId**

Replace the `create` method:

```java
@PostMapping
public ResponseEntity<ApiResponse<Conversation>> create(@RequestBody Map<String, String> body) {
    UUID userId = SecurityContext.getCurrentUserId();
    String title = body.getOrDefault("title", null);
    UUID knowledgeBaseId = null;
    if (body.containsKey("knowledgeBaseId") && body.get("knowledgeBaseId") != null
        && !body.get("knowledgeBaseId").isEmpty()) {
        knowledgeBaseId = UUID.fromString(body.get("knowledgeBaseId"));
    }
    Conversation convo = conversationService.create(userId, title, knowledgeBaseId);
    return ResponseEntity.status(HttpStatus.CREATED)
        .body(ApiResponse.success(convo));
}
```

- [ ] **Step 3: Add switch KB endpoint**

Add after the `extract` endpoint:

```java
/** 切换对话归属的知识库。只影响后续消息。 */
@PutMapping("/{id}/kb")
public ResponseEntity<ApiResponse<Conversation>> switchKnowledgeBase(
    @PathVariable UUID id,
    @RequestBody Map<String, String> body
) {
    UUID userId = SecurityContext.getCurrentUserId();
    UUID knowledgeBaseId = null;
    if (body.containsKey("knowledgeBaseId") && body.get("knowledgeBaseId") != null
        && !body.get("knowledgeBaseId").isEmpty()) {
        knowledgeBaseId = UUID.fromString(body.get("knowledgeBaseId"));
    }
    Conversation updated = conversationService.switchKnowledgeBase(id, userId, knowledgeBaseId);
    return ResponseEntity.ok(ApiResponse.success(updated));
}
```

- [ ] **Step 4: Compile**

```bash
cd KOMO/backend && mvn compile -q
```

- [ ] **Step 5: Commit**

```bash
git add KOMO/backend/src/main/java/com/komo/controller/ConversationController.java
git commit -m "feat: add knowledgeBaseId to conversation create/list + PUT /{id}/kb endpoint"
```

---

### Task 5: Update Frontend API Client

**Files:**
- Modify: `KOMO/frontend/packages/shared/api-client.ts`

**Interfaces:**
- Consumes: new backend endpoints
- Produces: `ConversationData.knowledgeBaseId`, updated `createConversation()`, new `switchConversationKb()`, `listConversations(kbId?)`

- [ ] **Step 1: Update ConversationData interface**

```typescript
export interface ConversationData {
  id: string;
  title: string;
  knowledgeBaseId: string | null;  // ★ new
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Update createConversation signature**

```typescript
export async function createConversation(
  title?: string,
  knowledgeBaseId?: string | null
): Promise<ConversationData> {
  const body: Record<string, string> = {};
  if (title) body.title = title;
  if (knowledgeBaseId) body.knowledgeBaseId = knowledgeBaseId;
  return post('/conversations', body);
}
```

- [ ] **Step 3: Add switchConversationKb function**

```typescript
export async function switchConversationKb(
  conversationId: string,
  knowledgeBaseId: string | null
): Promise<ConversationData> {
  return put(`/conversations/${conversationId}/kb`, {
    knowledgeBaseId: knowledgeBaseId ?? '',
  });
}
```

- [ ] **Step 4: Update listConversations to accept optional KB filter**

```typescript
export async function listConversations(kbId?: string): Promise<ConversationData[]> {
  const qs = kbId ? `?kb=${kbId}` : '';
  return get(`/conversations${qs}`);
}
```

- [ ] **Step 5: Verify API client compiles**

```bash
cd KOMO/frontend && npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add KOMO/frontend/packages/shared/api-client.ts
git commit -m "feat: add KB-scoped conversation types and API functions"
```

---

### Task 6: Rebuild Conversations Sidebar with KB Grouping

**Files:**
- Modify: `KOMO/frontend/packages/web/src/app/conversations/page.tsx` (replaces standalone list with KB-tree sidebar)
- Modify: `KOMO/frontend/packages/web/src/app/conversations/page.module.css`

**Interfaces:**
- Consumes: `listConversations()`, `listKnowledgeBases()`, `createConversation(title, kbId)`
- Produces: Tree sidebar UI with KB groups

The conversations page currently has a standalone list layout. We replace the content area with a sidebar + main layout where sidebar groups conversations by KB, and the main area shows a prompt or the active conversation.

However, based on the spec, the sidebar should appear on EVERY conversation page (list + detail). Given the current architecture where each page is independent, we'll build the sidebar into the conversations list page and embed it into the conversation detail page.

**Strategy:** Extract a reusable `ConversationSidebar` component that can be used in both `conversations/page.tsx` and `conversations/[id]/page.tsx`.

- [ ] **Step 1: Create ConversationSidebar component**

Create `KOMO/frontend/packages/web/src/components/ConversationSidebar/ConversationSidebar.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  listConversations,
  listKnowledgeBases,
  createConversation,
  deleteConversation,
  type ConversationData,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
import styles from './ConversationSidebar.module.css';

interface Props {
  activeConversationId?: string;
  onConversationChange?: () => void; // callback to refresh parent
}

export default function ConversationSidebar({ activeConversationId, onConversationChange }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsedKbs, setCollapsedKbs] = useState<Set<string>>(new Set());
  const [showNewMenu, setShowNewMenu] = useState(false);

  useEffect(() => {
    Promise.all([
      listConversations(),
      listKnowledgeBases(),
    ]).then(([convs, kbs]) => {
      setConversations(convs);
      setKnowledgeBases(kbs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Expose a refresh method via a global event (simpler than context for now)
  useEffect(() => {
    const handler = () => {
      listConversations().then(setConversations).catch(() => {});
    };
    window.addEventListener('conversation-sidebar-refresh', handler);
    return () => window.removeEventListener('conversation-sidebar-refresh', handler);
  }, []);

  const refreshConversations = () => {
    listConversations().then(setConversations).catch(() => {});
  };

  const toggleKb = (kbId: string) => {
    setCollapsedKbs(prev => {
      const next = new Set(prev);
      if (next.has(kbId)) next.delete(kbId);
      else next.add(kbId);
      return next;
    });
  };

  const handleNewConversation = async (kbId?: string) => {
    setShowNewMenu(false);
    try {
      const conv = await createConversation(undefined, kbId ?? null);
      setConversations(prev => [conv, ...prev]);
      router.push(`/conversations/${conv.id}`);
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('确定要删除这个对话吗？')) return;
    try {
      await deleteConversation(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id && onConversationChange) {
        onConversationChange();
      }
    } catch { /* ignore */ }
  };

  // Group conversations by KB
  const kbGroups = new Map<string | null, ConversationData[]>();
  for (const kb of knowledgeBases) {
    kbGroups.set(kb.id, []);
  }
  kbGroups.set(null, []);

  for (const conv of conversations) {
    const kbId = conv.knowledgeBaseId ?? null;
    if (!kbGroups.has(kbId)) {
      kbGroups.set(kbId, []);
    }
    kbGroups.get(kbId)!.push(conv);
  }

  if (loading) {
    return <aside className={styles.sidebar}><div className={styles.loading}>加载中...</div></aside>;
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <span className={styles.title}>对话</span>
        <div className={styles.newBtnWrap}>
          <button
            className={styles.newBtn}
            onClick={() => setShowNewMenu(!showNewMenu)}
          >
            + 新对话
          </button>
          {showNewMenu && (
            <div className={styles.newMenu}>
              {knowledgeBases.map(kb => (
                <button
                  key={kb.id}
                  className={styles.newMenuItem}
                  onClick={() => handleNewConversation(kb.id)}
                >
                  📁 {kb.name}
                </button>
              ))}
              <div className={styles.newMenuDivider} />
              <button
                className={styles.newMenuItem}
                onClick={() => handleNewConversation(undefined)}
              >
                📄 无知识库
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.list}>
        {/* KB groups */}
        {knowledgeBases.map(kb => {
          const convs = kbGroups.get(kb.id) || [];
          const isCollapsed = collapsedKbs.has(kb.id);
          return (
            <div key={kb.id} className={styles.kbGroup}>
              <div className={styles.kbHeader} onClick={() => toggleKb(kb.id)}>
                <span className={styles.kbCaret}>{isCollapsed ? '▶' : '▼'}</span>
                <span className={styles.kbIcon}>📁</span>
                <span className={styles.kbName}>{kb.name}</span>
                <button
                  className={styles.kbAddBtn}
                  onClick={(e) => { e.stopPropagation(); handleNewConversation(kb.id); }}
                  title="在此知识库新建对话"
                >
                  +
                </button>
              </div>
              {!isCollapsed && convs.map(conv => (
                <div key={conv.id} className={styles.convRow}>
                  <Link
                    href={`/conversations/${conv.id}`}
                    className={`${styles.convItem} ${
                      activeConversationId === conv.id ? styles.convActive : ''
                    }`}
                  >
                    <span className={styles.convIcon}>💬</span>
                    <span className={styles.convTitle}>{conv.title}</span>
                  </Link>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => handleDelete(conv.id, e)}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        {/* No-KB section */}
        <div className={styles.divider} />
        <div className={styles.kbGroup}>
          <div className={styles.kbHeader} onClick={() => toggleKb('__nokb__')}>
            <span className={styles.kbCaret}>
              {collapsedKbs.has('__nokb__') ? '▶' : '▼'}
            </span>
            <span className={styles.kbIcon}>📄</span>
            <span className={styles.noKbLabel}>无知识库对话</span>
            <button
              className={styles.kbAddBtn}
              onClick={(e) => { e.stopPropagation(); handleNewConversation(undefined); }}
              title="新建无知识库对话"
            >
              +
            </button>
          </div>
          {!collapsedKbs.has('__nokb__') && (kbGroups.get(null) || []).map(conv => (
            <div key={conv.id} className={styles.convRow}>
              <Link
                href={`/conversations/${conv.id}`}
                className={`${styles.convItem} ${
                  activeConversationId === conv.id ? styles.convActive : ''
                }`}
              >
                <span className={styles.convIcon}>💬</span>
                <span className={styles.convTitle}>{conv.title}</span>
              </Link>
              <button
                className={styles.deleteBtn}
                onClick={(e) => handleDelete(conv.id, e)}
                title="删除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create ConversationSidebar CSS module**

Create `KOMO/frontend/packages/web/src/components/ConversationSidebar/ConversationSidebar.module.css`:

```css
.sidebar {
  width: 260px;
  min-width: 260px;
  height: 100vh;
  background: var(--komo-bg-sidebar, #f8f9fa);
  border-right: 1px solid var(--komo-border, #e5e7eb);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--komo-border, #e5e7eb);
}

.title {
  font-size: 16px;
  font-weight: 700;
  color: var(--komo-text-primary, #111827);
}

.newBtnWrap {
  position: relative;
}

.newBtn {
  background: var(--komo-primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 13px;
  cursor: pointer;
}

.newBtn:hover {
  opacity: 0.9;
}

.newMenu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid var(--komo-border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  z-index: 100;
  min-width: 180px;
  overflow: hidden;
}

.newMenuItem {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: var(--komo-text-primary, #111827);
}

.newMenuItem:hover {
  background: var(--komo-bg-hover, #f3f4f6);
}

.newMenuDivider {
  height: 1px;
  background: var(--komo-border, #e5e7eb);
  margin: 4px 0;
}

.list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.kbGroup {
  margin-bottom: 4px;
}

.kbHeader {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  user-select: none;
  gap: 4px;
}

.kbHeader:hover {
  background: var(--komo-bg-hover, #f3f4f6);
}

.kbCaret {
  font-size: 10px;
  width: 14px;
  color: var(--komo-text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.kbIcon {
  font-size: 14px;
  flex-shrink: 0;
}

.kbName {
  font-size: 13px;
  font-weight: 600;
  color: var(--komo-text-primary, #111827);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.noKbLabel {
  font-size: 13px;
  font-weight: 600;
  color: var(--komo-text-tertiary, #9ca3af);
  flex: 1;
}

.kbAddBtn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--komo-text-tertiary, #9ca3af);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s;
}

.kbHeader:hover .kbAddBtn {
  opacity: 1;
}

.kbAddBtn:hover {
  color: var(--komo-primary, #2563eb);
}

.convRow {
  display: flex;
  align-items: center;
  padding-left: 28px;
}

.convRow:hover .deleteBtn {
  opacity: 1;
}

.convItem {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  flex: 1;
  text-decoration: none;
  border-radius: 4px;
  margin: 0 4px;
  min-width: 0;
}

.convItem:hover {
  background: var(--komo-bg-hover, #f3f4f6);
}

.convActive {
  background: var(--komo-bg-active, #e8f0fe);
}

.convIcon {
  font-size: 13px;
  flex-shrink: 0;
}

.convTitle {
  font-size: 13px;
  color: var(--komo-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deleteBtn {
  background: none;
  border: none;
  font-size: 16px;
  color: var(--komo-text-tertiary, #9ca3af);
  cursor: pointer;
  padding: 0 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.deleteBtn:hover {
  color: var(--komo-danger, #dc2626);
}

.divider {
  height: 1px;
  background: var(--komo-border, #e5e7eb);
  margin: 8px 12px;
}

.loading {
  padding: 24px;
  text-align: center;
  color: var(--komo-text-tertiary, #9ca3af);
  font-size: 13px;
}
```

- [ ] **Step 3: Update conversations page.tsx to use new sidebar**

Replace `KOMO/frontend/packages/web/src/app/conversations/page.tsx` with a layout that embeds the sidebar:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@komo/shared/api-client';
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import styles from './page.module.css';

export default function ConversationsPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe().then((u) => {
      if (!u) { router.push('/'); return; }
      setAuthed(true);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className={styles.page}><div className={styles.placeholder}>加载中...</div></div>;
  }

  if (!authed) return null;

  return (
    <div className={styles.page}>
      <ConversationSidebar />
      <main className={styles.main}>
        <div className={styles.placeholder}>
          <p className={styles.placeholderIcon}>💬</p>
          <p className={styles.placeholderTitle}>选择或创建一个对话</p>
          <p className={styles.placeholderDesc}>
            选择知识库创建对话，AI 将基于知识库内容回答并自动提取知识
          </p>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Update conversations page.module.css**

Replace content with layout styles:

```css
.page {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--komo-bg-main, #fff);
}

.placeholder {
  text-align: center;
  color: var(--komo-text-secondary, #6b7280);
}

.placeholderIcon {
  font-size: 48px;
  margin: 0 0 16px 0;
}

.placeholderTitle {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--komo-text-primary, #111827);
}

.placeholderDesc {
  font-size: 14px;
  margin: 0;
}
```

- [ ] **Step 5: Build frontend to verify**

```bash
cd KOMO/frontend/packages/web && npx next build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add KOMO/frontend/packages/web/src/components/ConversationSidebar/
git add KOMO/frontend/packages/web/src/app/conversations/page.tsx
git add KOMO/frontend/packages/web/src/app/conversations/page.module.css
git commit -m "feat: add ConversationSidebar with KB-grouped tree view"
```

---

### Task 7: Add KB Switcher to Conversation Detail Page

**Files:**
- Modify: `KOMO/frontend/packages/web/src/app/conversations/[id]/page.tsx`
- Modify: `KOMO/frontend/packages/web/src/app/conversations/[id]/page.module.css`

**Interfaces:**
- Consumes: `switchConversationKb()`, `listKnowledgeBases()`, `ConversationData.knowledgeBaseId`
- Produces: KB switcher dropdown in header

- [ ] **Step 1: Add KB switcher state and imports to conversation page**

In `conversations/[id]/page.tsx`, add imports:

```typescript
import ConversationSidebar from '@/components/ConversationSidebar/ConversationSidebar';
import {
  // ... existing imports
  switchConversationKb,
  listKnowledgeBases,
  type KnowledgeBaseData,
} from '@komo/shared/api-client';
```

Add new state variables after existing ones:

```typescript
const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseData[]>([]);
const [currentKbId, setCurrentKbId] = useState<string | null>(null);
const [showKbSwitcher, setShowKbSwitcher] = useState(false);
```

- [ ] **Step 2: Load KBs and current conversation KB in useEffect**

In the main `useEffect` (where `getMe()` is called), add KB loading:

```typescript
useEffect(() => {
  getMe().then((u) => {
    if (!u) {
      router.push('/');
      return;
    }
    setAutoExtract(u.autoExtract);
    fetchData();
    // Load KBs for the switcher
    listKnowledgeBases().then(setKnowledgeBases).catch(() => {});
  });
}, [conversationId]);
```

After `fetchData` gets conversations, sync the current conversation's KB:

```typescript
const fetchData = async () => {
  setLoading(true);
  setError(null);
  try {
    const [msgs, convs] = await Promise.all([
      getMessages(conversationId),
      listConversations(),
    ]);
    setMessages(msgs);
    setConversations(convs);
    // Sync current KB
    const current = convs.find(c => c.id === conversationId);
    if (current) {
      setCurrentKbId(current.knowledgeBaseId ?? null);
    }
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Add handleSwitchKb function**

```typescript
const handleSwitchKb = async (kbId: string | null) => {
  setShowKbSwitcher(false);
  try {
    const updated = await switchConversationKb(conversationId, kbId);
    setCurrentKbId(updated.knowledgeBaseId ?? null);
    // Refresh sidebar
    window.dispatchEvent(new Event('conversation-sidebar-refresh'));
  } catch (err) {
    setError((err as Error).message);
  }
};
```

- [ ] **Step 4: Add getCurrentKbName helper**

```typescript
const getCurrentKbName = (): string => {
  if (currentKbId === null) return '📄 无知识库';
  const kb = knowledgeBases.find(k => k.id === currentKbId);
  return kb ? `📁 ${kb.name}` : '📁 知识库';
};
```

- [ ] **Step 5: Update page layout to include sidebar + KB switcher**

Replace the return JSX to wrap with sidebar layout and add KB switcher in header:

In the return JSX, wrap the existing layout with:

```tsx
// After the auth/loading/error guards, the main return:
return (
  <div className={styles.layout}>
    <ConversationSidebar activeConversationId={conversationId} />
    <main className={styles.chat}>
      <div className={styles.chatHeader}>
        <div className={styles.kbSwitcherWrap}>
          <button
            className={`${styles.kbSwitcher} ${currentKbId === null ? styles.kbSwitcherNoKb : ''}`}
            onClick={() => setShowKbSwitcher(!showKbSwitcher)}
          >
            {getCurrentKbName()} ▾
          </button>
          {showKbSwitcher && (
            <div className={styles.kbSwitcherMenu}>
              {knowledgeBases.map(kb => (
                <button
                  key={kb.id}
                  className={`${styles.kbSwitcherItem} ${
                    currentKbId === kb.id ? styles.kbSwitcherItemActive : ''
                  }`}
                  onClick={() => handleSwitchKb(kb.id)}
                >
                  📁 {kb.name}
                </button>
              ))}
              <div className={styles.kbSwitcherDivider} />
              <button
                className={`${styles.kbSwitcherItem} ${
                  currentKbId === null ? styles.kbSwitcherItemActive : ''
                }`}
                onClick={() => handleSwitchKb(null)}
              >
                📄 无知识库
              </button>
            </div>
          )}
        </div>
        <span className={styles.chatTitle}>
          {conversations.find(c => c.id === conversationId)?.title || '对话'}
        </span>
        <div className={styles.chatHeaderRight}>
          {/* existing extract button logic — hidden when no-KB */}
          {!autoExtract && currentKbId !== null && (
            <button onClick={handleExtract} disabled={extracting || extractDone}
              className={styles.extractBtn}>
              {extracting ? '提取中...' : extractDone ? '✓ 已提取' : '提取知识'}
            </button>
          )}
        </div>
      </div>
      {/* ... rest of chat content unchanged: messages, input, draft hint ... */}
    </main>
  </div>
);
```

- [ ] **Step 6: Add CSS for KB switcher**

In `page.module.css`, add:

```css
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chatHeader {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--komo-border, #e5e7eb);
  background: var(--komo-bg-main, #fff);
  flex-shrink: 0;
}

.kbSwitcherWrap {
  position: relative;
}

.kbSwitcher {
  background: var(--komo-bg-sidebar, #f8f9fa);
  border: 1px solid var(--komo-border, #e5e7eb);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--komo-text-primary, #111827);
  white-space: nowrap;
}

.kbSwitcher:hover {
  background: var(--komo-bg-hover, #f3f4f6);
}

.kbSwitcherNoKb {
  color: var(--komo-text-tertiary, #9ca3af);
}

.kbSwitcherMenu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid var(--komo-border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  z-index: 100;
  min-width: 180px;
  overflow: hidden;
}

.kbSwitcherItem {
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: var(--komo-text-primary, #111827);
}

.kbSwitcherItem:hover {
  background: var(--komo-bg-hover, #f3f4f6);
}

.kbSwitcherItemActive {
  background: var(--komo-bg-active, #e8f0fe);
  font-weight: 600;
}

.kbSwitcherDivider {
  height: 1px;
  background: var(--komo-border, #e5e7eb);
  margin: 4px 0;
}

.chatTitle {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--komo-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chatHeaderRight {
  display: flex;
  gap: 8px;
}

.extractBtn {
  background: var(--komo-primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
}

.extractBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

Also update the `.chatHeader` to remove the old standalone header styles (the old `.chatHeader` and `.chatTitle` in the existing CSS should be kept for the case where the sidebar isn't loaded, but the new layout styles take precedence).

Note: We need to update the existing `.chat` class to `.chat` (already there but now wrapped in `.layout`). The existing CSS classes are mostly compatible — just add the new ones above.

- [ ] **Step 7: Build frontend**

```bash
cd KOMO/frontend/packages/web && npx next build 2>&1 | tail -30
```

- [ ] **Step 8: Commit**

```bash
git add KOMO/frontend/packages/web/src/app/conversations/\[id\]/page.tsx
git add KOMO/frontend/packages/web/src/app/conversations/\[id\]/page.module.css
git commit -m "feat: add KB switcher dropdown to conversation page header"
```

---

### Task 8: Quote-to-Chat — Right-Click Menu on Article Page

**Files:**
- Modify: `KOMO/frontend/packages/web/src/app/article/[id]/page.tsx`
- Modify: `KOMO/frontend/packages/web/src/app/article/[id]/page.module.css`

**Interfaces:**
- Consumes: `createConversation(title, knowledgeBaseId)`
- Produces: Right-click context menu for quoting text → new conversation

- [ ] **Step 1: Create ContextMenu component**

Create `KOMO/frontend/packages/web/src/components/ContextMenu/ContextMenu.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: {
    label: string;
    icon?: string;
    onClick: () => void;
  }[];
}

export default function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 36);

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          className={styles.item}
          onClick={() => { item.onClick(); onClose(); }}
        >
          {item.icon && <span className={styles.icon}>{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
```

Create `KOMO/frontend/packages/web/src/components/ContextMenu/ContextMenu.module.css`:

```css
.menu {
  position: fixed;
  z-index: 1000;
  background: #fff;
  border: 1px solid var(--komo-border, #e5e7eb);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  min-width: 180px;
  padding: 4px 0;
  overflow: hidden;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  color: var(--komo-text-primary, #111827);
}

.item:hover {
  background: var(--komo-bg-hover, #f3f4f6);
}

.icon {
  font-size: 14px;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Add context menu handler to article page**

In `article/[id]/page.tsx`, add imports:

```typescript
import { useRef, useCallback } from 'react'; // add to existing imports, useRef already there
import { createConversation } from '@komo/shared/api-client';
import ContextMenu from '@/components/ContextMenu/ContextMenu';
```

Add state for context menu:

```typescript
const [contextMenu, setContextMenu] = useState<{
  x: number; y: number; quote: string;
} | null>(null);
```

Add the context menu handler on the article body:

```typescript
const handleArticleContextMenu = useCallback((e: React.MouseEvent) => {
  const selection = window.getSelection();
  const text = selection?.toString().trim() || '';
  if (text.length < 5) return; // let browser handle native menu for short/no selection
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, quote: text });
}, []);
```

Add the quote-to-chat handler:

```typescript
const handleQuoteToChat = async () => {
  if (!contextMenu || !article) return;
  const { quote } = contextMenu;
  const title = quote.length > 20 ? quote.slice(0, 20) + '...' : quote;
  try {
    const conv = await createConversation(
      title,
      article.knowledgeBaseId ?? undefined
    );
    const params = new URLSearchParams();
    params.set('quote', quote);
    params.set('source', article.title);
    params.set('sourceId', article.id);
    router.push(`/conversations/${conv.id}?${params.toString()}`);
  } catch (err) {
    // ignore
  }
};
```

Add the `onContextMenu` handler to the article body div:

```tsx
<div className={styles.articleBody} ref={articleBodyRef} onContextMenu={handleArticleContextMenu}>
  <MarkdownRenderer content={article.content} />
</div>
```

Add the ContextMenu render at the end of the return JSX (inside the outermost div, before the closing tag):

```tsx
{contextMenu && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => setContextMenu(null)}
    items={[
      {
        label: '💬 追问 KOMO',
        onClick: handleQuoteToChat,
      },
    ]}
  />
)}
```

- [ ] **Step 3: Add quote pre-fill logic to conversation page**

In `conversations/[id]/page.tsx`, in the `useEffect` that runs after loading:

```typescript
// Check for quote params (from article page)
useEffect(() => {
  if (typeof window === 'undefined') return;
  const searchParams = new URLSearchParams(window.location.search);
  const quote = searchParams.get('quote');
  const source = searchParams.get('source');
  if (quote) {
    const lines = [`> ${quote}`];
    if (source) lines.push(`> 来源：${source}`);
    lines.push('', ''); // empty line + cursor position
    setInput(lines.join('\n'));
    // Clean URL without reloading
    const url = new URL(window.location.href);
    url.searchParams.delete('quote');
    url.searchParams.delete('source');
    url.searchParams.delete('sourceId');
    window.history.replaceState({}, '', url.toString());
  }
}, []);
```

- [ ] **Step 4: Build frontend**

```bash
cd KOMO/frontend/packages/web && npx next build 2>&1 | tail -30
```

- [ ] **Step 5: Commit**

```bash
git add KOMO/frontend/packages/web/src/components/ContextMenu/
git add KOMO/frontend/packages/web/src/app/article/\[id\]/page.tsx
git add KOMO/frontend/packages/web/src/app/conversations/\[id\]/page.tsx
git commit -m "feat: add quote-to-chat — right-click context menu on article page"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Start backend and verify endpoints**

```bash
# Start backend (ensure all env vars set)
cd KOMO/backend && export $(grep -v '^#' ../../docker/.env | xargs) && \
  export JWT_SECRET="JDuXQl32uS5FFOfkSZb/AmauXdQbg+WtKjEUQ/EpOM0=" && \
  mvn spring-boot:run &
```

Test endpoints:

```bash
# Create a KB-scoped conversation
curl -X POST http://localhost:8081/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"title":"测试KB对话","knowledgeBaseId":"<DEFAULT_KB_ID>"}' \
  -b cookies.txt -c cookies.txt

# Switch KB
curl -X PUT http://localhost:8081/api/conversations/<CONV_ID>/kb \
  -H "Content-Type: application/json" \
  -d '{"knowledgeBaseId":""}' \
  -b cookies.txt -c cookies.txt
```

- [ ] **Step 2: Start frontend and test manually**

```bash
cd KOMO/frontend/packages/web && npm run dev
```

Manual test checklist:
1. Open http://localhost:3000/conversations — sidebar shows KB groups
2. Click [+ 新对话] → dropdown shows KB options → create under a KB
3. Create a no-KB conversation → verify "📄 无知识库" in header
4. Switch KB via header dropdown → verify toast and system message
5. Open an article → select text → right-click → "💬 追问 KOMO"
6. Verify new conversation created with quote pre-filled in input

- [ ] **Step 3: Build check**

```bash
cd KOMO/backend && mvn compile -q
cd KOMO/frontend/packages/web && npx next build
```

- [ ] **Step 4: Commit all remaining changes and push**

```bash
git status
git add -A  # Only if clean
git commit -m "feat: finalize KB-scoped conversations + quote-to-chat"
git push origin main
```

---

## Completion Checklist

- [ ] Backend compiles cleanly (`mvn compile -q`)
- [ ] Frontend builds cleanly (`npx next build`)
- [ ] No empty catch blocks in changed Java files
- [ ] No Tailwind classes used
- [ ] All API calls go through `@komo/shared/api-client`
- [ ] All new components have `'use client'` directive
- [ ] Migration SQL executed against database
- [ ] Git working tree is clean
