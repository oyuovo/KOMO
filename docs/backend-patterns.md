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
- JWT: Access 15min, Refresh 7d. Token stored in `localStorage` (not in-memory).
- Frontend: `getToken()` reads from localStorage, `refreshAuth()` auto-refreshes on 401.

## Key Files

| Layer | Path |
|-------|------|
| Config | `config/SecurityConfig.java`, `config/ElasticsearchConfig.java` |
| Controller | `controller/KnowledgeController.java`, `controller/ConversationController.java`, `controller/DraftController.java`, `controller/AuthController.java` |
| Service | `service/KnowledgeService.java`, `service/ConversationService.java`, `service/KnowledgeDraftService.java`, `service/KnowledgeIndexService.java`, `service/DedupService.java`, `service/UserService.java` |
| Repository | `repository/KnowledgeRepository.java`, `repository/KnowledgeDraftRepository.java`, `repository/ConversationRepository.java`, `repository/MessageRepository.java` |
| Entity | `entity/KnowledgeEntry.java`, `entity/KnowledgeDraft.java`, `entity/Conversation.java`, `entity/Message.java` |
| DTO | `dto/request/*.java`, `dto/response/*.java`, `dto/DedupResult.java` |
