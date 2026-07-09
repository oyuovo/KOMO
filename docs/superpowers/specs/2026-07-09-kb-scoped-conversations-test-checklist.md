## Pending E2E Testing

The KB-scoped conversations + quote-to-chat feature (commits `433437b`..`89d8b6d`) has been compile-verified but not yet tested end-to-end.

### Manual Test Checklist

1. **KB-scoped conversations:**
   - [ ] Sidebar shows KB groups with conversations
   - [ ] Create conversation under a KB → appears under that KB in sidebar
   - [ ] Create no-KB conversation → appears in "无知识库对话" section
   - [ ] No-KB conversation header shows "📄 无知识库"
   - [ ] Switch conversation KB via header dropdown → sidebar refreshes
   - [ ] No-KB conversation hides the "提取知识" button
   - [ ] No-KB conversation does NOT auto-extract (verify no drafts created)

2. **Quote-to-chat:**
   - [ ] Open article → select text → right-click → "💬 追问 KOMO" appears
   - [ ] Click creates new conversation in the article's KB
   - [ ] Input pre-filled with `> quoted text\n> 来源：article title`
   - [ ] Short selection (<5 chars) does NOT show context menu

3. **SSE resilience:**
   - [ ] Start a message → immediately navigate away → conversation still has the AI reply
   - [ ] Wait for generation to complete off-screen → return to conversation → full message visible

### How to Test

```bash
# Start all services
docker compose -f docker/docker-compose.yml up -d
cd KOMO/backend && export $(grep -v '^#' ../../docker/.env | xargs) && \
  export JWT_SECRET="JDuXQl32uS5FFOfkSZb/AmauXdQbg+WtKjEUQ/EpOM0=" && \
  mvn spring-boot:run &
cd KOMO/frontend/packages/web && npm run dev
# Open http://localhost:3000
```
