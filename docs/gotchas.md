# Gotchas

## SSE Streaming

- Uses direct `HttpServletResponse.getOutputStream()` with `AsyncContext` (not SseEmitter). Tomcat default 30s timeout would kill long AI responses — set `spring.mvc.async.request-timeout=180000`.
- SSE format: `event: name\ndata: text\n\n` — **space after colon is REQUIRED** by the SSE spec. Missing space = frontend silently ignores all events.
- Python `_sse_encode()` splits internal `\n` into multi-line `data:` format to prevent data content from corrupting SSE event boundaries.
- Frontend parser uses `line.startsWith('data: ')` with multi-line coalescing and buffer management.

## Chinese Encoding

- curl on Git Bash sends GBK, not UTF-8. Use Python requests for testing Chinese content.
- SmartCN analyzer handles Chinese tokenization without external plugins.
- `MarkdownRenderer.normalizeChineseMarkdown()` inserts zero-width space (`​`) between `**` and Chinese smart quotes — CommonMark treats Unicode punctuation as non-delimiting for bold/italic.

## Docker

- Docker Desktop on Windows can hang after sleep/hibernation. Fix: `wsl --terminate docker-desktop` then restart Docker Desktop application.
- If Docker CLI hangs (500 Internal Server Error on pipe): fully quit Docker Desktop, `wsl --shutdown`, restart Docker Desktop.
- Hub inaccessible in China: Use `docker.elastic.co/elasticsearch/elasticsearch:8.12.0`.
- `docker/.env` contains `DEEPSEEK_API_KEY` for AI service.

## ES

- Newly indexed docs need `_refresh` before appearing in search. Java client auto-handles this.
- `deleteEntry()` catches `ElasticsearchException` with status 404 separately from real errors.
- `updateEntry()` must pass `userId` (not null) on 404 fallback, or the re-indexed doc becomes unsearchable.

## Backend Compilation

- Lombok: `@RequiredArgsConstructor` generates constructor for final fields only. Adding a new final field auto-includes it.
- `mvn compile -q` for quick check, `mvn spring-boot:run` for full start (must be run from `KOMO/backend` directory).
- `mvn clean compile` needed after structural changes (new entities, new controllers).

## Frontend

- Next.js 16 App Router with Turbopack (`npm run dev`).
- All components must use `'use client'` directive when using hooks/state.
- API calls go through `@komo/shared/api-client`, never direct fetch.
- CSS Modules only, no Tailwind.
- **SSR hydration**: Never derive initial state from `getToken()`/`getUser()`. Both return null on server (no `window`). Use `useEffect` for client-only auth. Initial `needsAuth` must be `false`.
- `npx next build` must be run from `KOMO/frontend/packages/web` directory.

## JWT / Auth

- Access token: 1 hour, Refresh: 7 days. Config in `application.yml` (`komo.jwt.*`).
- Frontend `request()` auto-refreshes on 401 AND 403 (not just 401) — expiration returns 403 from Spring Security stateless mode.
- On refresh failure: `clearTokens()` + `window.location.href = '/'`.

## Knowledge Base IDs

- Article IDs are standard UUIDv4 (NOT 8-char short IDs). Always use full UUIDs in API calls.
- KB IDs are also full UUIDs. Test scripts that truncate with `[:8]` will produce invalid IDs.
