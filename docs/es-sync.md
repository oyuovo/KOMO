# Elasticsearch Index Sync

## Index: `komo_knowledge`

- Analyzer: `smart_cn` (built-in SmartCN tokenizer)
- Fields: `userId` (keyword), `title` (text, boost 3.0), `contentPlain` (text), `createdAt` (date)
- 1 shard, 0 replicas

## Sync Points

| Operation | ES Action |
|-----------|-----------|
| `KnowledgeService.create()` | `indexEntry()` |
| `KnowledgeService.update()` | `updateEntry()` (404 → re-index) |
| `KnowledgeService.softDelete()` | `deleteEntry()` |
| `KnowledgeDraftService.confirm()` | `indexEntry()` |
| `KnowledgeDraftService.editAndConfirm()` | `indexEntry()` |

## Error Handling

- `deleteEntry()`: 404 → silent (already gone), other errors → stderr
- `updateEntry()`: 404 → falls back to `indexEntry()` (re-create)
- `POST /api/knowledge/reindex` → manual full rebuild from DB (accessible from Settings page)

## Search

- `search(userId, query, size)`: bool filter by userId + multi_match on title^3 + contentPlain
- `findSimilar(userId, title, content, size)`: more_like_this for dedup
- RAG in ConversationService: `knowledgeIndexService.search(userId, content, 3)`

## Troubleshooting

If ES and DB are out of sync:
1. Call `POST /api/knowledge/reindex` from Settings page
2. Or check ES: `curl localhost:9201/komo_knowledge/_count`
