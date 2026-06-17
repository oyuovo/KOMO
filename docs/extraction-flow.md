# Knowledge Extraction Flow

## Pipeline

```
1. User sends message → ConversationService calls Python /api/chat/stream
2. AI reply saved → extractAndSaveDrafts() → Python /api/extraction/extract
3. Returns [{type, title, content, confidence}] where type = ARTICLE | FRAGMENT | SUPPLEMENT
4. DedupService.checkDuplicate() → ES more_like_this + title LCS → score
   - score > 0.6: auto-reject (no draft created)
   - score 0.2-0.6: PENDING_DEDUP (needs LLM review)
   - score < 0.2: PENDING (show to user)
5. Routing by type:
   - ARTICLE: PENDING → user confirms → default KB
   - SUPPLEMENT: match parent article → PENDING → user confirms → embed
   - FRAGMENT + ES match (>0.4): PENDING → default embed into matched article
   - FRAGMENT + no match: PENDING → user confirms → fragments KB (fallback)
6. User can override target KB or manually search parent article at confirm time
```

## Extract Types

| Type | Prompt guidance | Default destination |
|------|----------------|---------------------|
| ARTICLE | 完整自成体系的知识，200字以上，结构清晰 | 默认知识库 |
| FRAGMENT | 简短事实/定义/技巧，50-200字 | 知识碎片库（无匹配时） |
| SUPPLEMENT | 对已有知识的延伸/举例/细化 | 嵌入到匹配的父文章 |

## Dedup Thresholds

In `DedupService.java`:
- `DUPLICATE_THRESHOLD = 0.6`
- `NEW_THRESHOLD = 0.2`
- `MLT_NORMAL_SCALE = 20.0`
- FRAGMENT embed threshold: score > 0.4 (in ConversationService)

## DraftStatus

| Status | Meaning | User-visible |
|--------|---------|-------------|
| PENDING | New, ready for review | Yes |
| PENDING_DEDUP | Needs LLM semantic check | No (hidden) |
| CONFIRMED | User confirmed → knowledge entry | No (archived) |
| EDITED | User edited then confirmed | No (archived) |
| REJECTED | User rejected | No (archived) |
| REJECTED_AUTO | Auto-rejected (high duplicate score) | No (discarded) |

## AI Service Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/chat/stream` | SSE streaming chat |
| `POST /api/chat/sync` | Synchronous chat |
| `POST /api/extraction/extract` | Extract knowledge from messages (returns type field) |
| `POST /api/dedup/check` | LLM semantic duplicate check |
