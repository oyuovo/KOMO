# Frontend Patterns

## Stack

- Next.js App Router with client components (`'use client'`)
- Shared API client in `packages/shared/api-client.ts` — all API functions + types
- CSS Modules with design tokens from `packages/shared/tokens/tokens.css`
- Radix UI for behavior, custom CSS Modules for styling (**never Tailwind**)
- `MarkdownRenderer` component wraps `react-markdown` + `remark-gfm`

## Token Management (api-client.ts)

- `getToken()` / `getUser()` — reads from localStorage, SSR-safe (checks `typeof window`)
- `setTokens(access, refresh, user)` — persists to localStorage
- `refreshAuth()` — auto-refreshes on 401/403, request-level retry
- `redirectToLogin()` — clears tokens + `window.location.href = '/'`
- All API functions exported from `@komo/shared/api-client`

## Error Handling

- `request()` catches: network errors → "无法连接服务器", JSON parse errors → "服务响应异常"
- 401/403 → tries `refreshAuth()` first, only redirects to login on refresh failure
- Components: use `useEffect` for client-only auth checks; `needsAuth` must start `false` to avoid SSR mismatch

## Key Components

| Component | Purpose |
|-----------|---------|
| `KnowledgeBaseSidebar` | Left sidebar: KB list, create/rename/delete, system badge for fragments KB |
| `KnowledgeList` | Article list with selection mode, batch delete toolbar, KB filtering |
| `BatchDeleteOverlay` | Reusable deletion progress overlay (spinner + progress bar + auto-dismiss) |
| `TopNav` | Navigation bar with draft count badge |
| `MarkdownRenderer` | Markdown rendering with Chinese quote bold fix |
| `ComingSoon` | 404 page (also used for `/_not-found` route) |

## Key Pages

| Page | Notes |
|------|-------|
| `app/page.tsx` | Home: KB sidebar + search + KnowledgeList + draft hint |
| `app/conversations/page.tsx` | Conversation list with selection mode + batch delete |
| `app/conversations/[id]/page.tsx` | Chat with SSE streaming (multi-line data parser) |
| `app/drafts/page.tsx` | Drafts with extractType badges, KB selector, article embed search |
| `app/article/[id]/page.tsx` | Article view: left sidebar (same-KB articles only), right panel with merge-to-article for fragments |
| `app/article/[id]/edit/page.tsx` | Edit with type selector (FACT/CONCEPT/INSIGHT/METHOD/QUESTION) |
| `app/settings/page.tsx` | Account info, data stats, ES reindex button |
| `app/knowledge/create/page.tsx` | Create article with type selector |

## Component Patterns

- Each page fetches own data via `useEffect` + try/catch
- State: `loading` → `error` → data
- Selection mode: `selectMode` state → checkboxes appear → batch toolbar at bottom → confirm → BatchDeleteOverlay
- Delete: confirm dialog → API call → remove from local state
- SSR-safe: all `getToken()`/`getUser()` calls are either in `useEffect` or guarded by `typeof window`
- Initial state for auth must be `false` (not derived from `getToken()`) to prevent hydration mismatch
