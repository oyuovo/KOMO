# Gotchas

## SSE Streaming

- Uses SseEmitter with `spring.mvc.async.request-timeout=180000`. Tomcat default 30s would kill long AI responses.
- SSE reading uses `BufferedInputStream` with 4KB chunks, detects `\n\n` event boundaries.
- Contents internal newlines are preserved (don't use BufferedReader.readLine()).

## Chinese Encoding

- curl on Git Bash sends GBK, not UTF-8. Use Python urllib for testing Chinese content.
- SmartCN analyzer handles Chinese tokenization without external plugins.

## Docker

- Docker Hub inaccessible in China: Use `docker.elastic.co/elasticsearch/elasticsearch:8.12.0` (Elastic's own registry).

## ES

- Newly indexed docs need `_refresh` before appearing in search. Java client auto-handles this.
- `deleteEntry()` catches `ElasticsearchException` with status 404 separately from real errors.

## Backend Compilation

- Lombok: `@RequiredArgsConstructor` generates constructor for final fields only.
- `mvn compile -q` for quick check, `mvn spring-boot:run` for full start.
- Service classes should use `@RequiredArgsConstructor`, not `@Autowired`.

## Frontend

- Next.js 16: App Router with Turbopack (`npm run dev`).
- All components must use `'use client'` directive when using hooks/state.
- API calls go through `@komo/shared/api-client`, never direct fetch.
- CSS Modules only, no Tailwind.
