# Backend Patterns

## Layers

```
Controller → Service (extends BaseService<T>) → Repository (userId-enforced queries) → Entity (UUID PK, extends BaseEntity)
```

- Controllers in `com.komo.controller`
- Services use `@RequiredArgsConstructor` + `@Transactional`
- All API responses wrapped in `ApiResponse<T>` (code/message/data/timestamp)
- Global error handling via `@RestControllerAdvice GlobalExceptionHandler`

## Security (non-negotiable)

- All data access enforced by `user_id`. Never use bare `findById()`. Repository methods always include `userId`.
- `BaseService<T>` enforces ownership via `findByIdOrThrow()`.
- JWT: Access 1 hour, Refresh 7 days. Token stored in `localStorage`.
- Frontend: `getToken()` reads from localStorage, `refreshAuth()` auto-refreshes on 401/403.

## Key Files

| Layer | Path |
|-------|------|
| Config | `config/SecurityConfig.java`, `config/ElasticsearchConfig.java` |
| Controller | `KnowledgeController.java`, `KnowledgeBaseController.java`, `ConversationController.java`, `DraftController.java`, `AuthController.java` |
| Service | `KnowledgeService.java`, `KnowledgeBaseService.java`, `ConversationService.java`, `KnowledgeDraftService.java`, `KnowledgeIndexService.java`, `DedupService.java`, `UserService.java` |
| Repository | `KnowledgeRepository.java`, `KnowledgeBaseRepository.java`, `KnowledgeDraftRepository.java`, `ConversationRepository.java`, `MessageRepository.java`, `KnowledgeLinkRepository.java` |
| Entity | `KnowledgeEntry.java`, `KnowledgeBase.java`, `KnowledgeDraft.java`, `KnowledgeLink.java`, `Conversation.java`, `Message.java` |
| DTO | `dto/request/*.java`, `dto/response/*.java`, `dto/DedupResult.java`, `dto/BatchDeleteResult.java` |

## Knowledge Base system

- `KnowledgeBaseService.ensureSystemBases(userId)` — auto-creates DEFAULT and SYSTEM_FRAGMENTS KBs on first access
- SYSTEM_FRAGMENTS KB is non-deletable (`isDeletable=false`); delete returns 400
- `KnowledgeEntry.knowledgeBaseId` set on create; default KB used if not specified
- `KnowledgeRepository.findByUserIdAndFilters` supports `knowledgeBaseId` filter parameter

## Draft confirmation routing

- `confirm(draftId, overrideKbId)` — routes to fragments/default KB based on `extractType`
- `confirmWithParent(draftId, overrideKbId, parentEntryId)` — if parent specified, links to it and uses parent's KB
- `editAndConfirm(draftId, title, content, overrideKbId)` — same routing logic

## Content merge

- `KnowledgeService.mergeInto(fragmentId, targetId)`:
  1. Parses target markdown for `## ` headings
  2. Matches fragment title against headings (Jaccard character overlap)
  3. Match > 0.25 → inserts after that section; else appends to end with `### ` heading
  4. Updates target content + ES index, soft-deletes fragment, creates KnowledgeLink

## Batch operations

- `KnowledgeService.batchSoftDelete(List<UUID>)` / `ConversationService.batchDelete(List<UUID>, UUID userId)`
- Return `BatchDeleteResult { deleted, failed, total }` — single failure doesn't block others
- Endpoints: `DELETE /api/knowledge/batch`, `DELETE /api/conversations/batch`
