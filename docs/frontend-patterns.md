# Frontend Patterns

## Stack

- Next.js App Router with client components (`'use client'`)
- Shared API client in `packages/shared/api-client.ts` — all API functions + types
- CSS Modules with design tokens from `packages/shared/tokens/tokens.css`
- Radix UI for behavior, custom CSS Modules for styling (**never Tailwind**)
- `MarkdownRenderer` component wraps `react-markdown` + `remark-gfm`

## Token Management (api-client.ts)

- `getToken()` / `getUser()` — reads from localStorage
- `setTokens(access, refresh, user)` — persists to localStorage
- `refreshAuth()` — auto-refreshes on 401, request-level retry
- `redirectToLogin()` — clears tokens + `window.location.href = '/'`
- All API functions exported from `@komo/shared/api-client`

## Error Handling

- `request()` catches: network errors → "无法连接服务器", JSON parse errors → "服务响应异常"
- 401 + refresh failure → auto-redirect to login (no error message shown to user)
- Components: check `getToken()` in useEffect, redirect if null

## Component Patterns

- Each page fetches own data via useEffect
- State: `loading` → `error` → data
- Delete: confirm dialog → API call → remove from local state

## Key Files

| Path | Purpose |
|------|---------|
| `packages/shared/api-client.ts` | All API types + functions + auth |
| `packages/shared/tokens/tokens.css` | Design tokens |
| `components/TopNav/TopNav.tsx` | Navigation bar |
| `components/MarkdownRenderer/MarkdownRenderer.tsx` | Markdown rendering |
| `app/page.tsx` | Home (knowledge list + search + login) |
| `app/conversations/page.tsx` | Conversation list |
| `app/conversations/[id]/page.tsx` | Chat with SSE streaming |
| `app/drafts/page.tsx` | Draft management |
| `app/knowledge/create/page.tsx` | Create knowledge |
| `app/article/[id]/page.tsx` | View article |
| `app/article/[id]/edit/page.tsx` | Edit article |
| `app/settings/page.tsx` | User settings + reindex |
