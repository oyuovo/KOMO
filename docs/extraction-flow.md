# Knowledge Extraction Flow

## Pipeline

```
1. User sends message → ConversationService calls Python /api/chat/stream
2. AI reply saved → extractAndSaveDrafts() → Python /api/extraction/extract
3. DedupService.checkDuplicate() → ES more_like_this + title LCS → score
   - score > 0.6: auto-reject (no draft created)
   - score 0.2-0.6: PENDING_DEDUP (needs LLM review)
   - score < 0.2: PENDING (show to user)
4. Draft confirm → KnowledgeEntry created → synced to ES index
```

## Dedup Thresholds

In `DedupService.java`:
- `DUPLICATE_THRESHOLD = 0.6`
- `NEW_THRESHOLD = 0.2`
- `MLT_NORMAL_SCALE = 20.0`

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
| `POST /api/extraction/extract` | Extract knowledge from messages |
| `POST /api/dedup/check` | LLM semantic duplicate check |
