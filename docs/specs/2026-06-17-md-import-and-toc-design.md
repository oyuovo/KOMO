# MD Import & Article TOC Design

Date: 2026-06-17 | Status: Approved

## Overview

Two features:
1. **Import .md files** — independent page, file selection + preview + local image warning, reuse existing create API
2. **Article TOC** — left-floating overlay, extracts `##`/`###` headings, click-to-scroll, IntersectionObserver highlight

---

## Feature 1: Markdown Import Page

### Route
`/knowledge/import` — new page

### Entry Point
Homepage (`app/page.tsx`) — enable the existing disabled "导入" button, link to `/knowledge/import`

### Flow
1. User clicks "导入" on homepage → navigates to `/knowledge/import`
2. Page shows a file drop zone (click or drag .md file)
3. On file selection:
   - `FileReader.readAsText()` reads content
   - First `# Title` extracted as default title (user can edit)
   - Regex `/!\[.*?\]\((?!https?:\/\/)(\.{0,2}\/[^)]+|[^)\/][^)]*)\)/g` detects local image references
4. User configures: target KB (dropdown), entry type (dropdown), optional tags
5. Content preview area shows rendered markdown
6. If local images detected → yellow warning box: "检测到 N 处本地图片引用，导入后无法显示" with list of paths
7. "确认导入" button calls `createKnowledge()` API with `source: MANUAL`
8. On success → redirect to the new article page `/article/{id}`

### Component Structure
```
app/knowledge/import/page.tsx     — page component ('use client')
app/knowledge/import/page.module.css
```

### States
- **idle** — drop zone shown, no file selected
- **file-loaded** — preview area + config form visible
- **importing** — button disabled with spinner
- **success** — redirect
- **error** — error banner (e.g., file too large, read error, API error)

### Constraints
- File size limit: 2MB (frontend check, clear error message)
- Only `.md` / `.markdown` extension accepted
- Title: auto-extracted, max 500 chars, editable
- Content passed as-is to backend (no image path rewriting for Phase A)

### Backend
No changes needed — reuses `POST /api/knowledge` with `KnowledgeCreateRequest`

---

## Feature 2: Article TOC (Left Floating)

### Location
Left column, between article list sidebar and main content. Fixed/floating, not part of the three-column layout flow.

### Behavior
1. Parse `article.content` for `## ` and `### ` headings (regex: `/^#{2,3}\s+(.+)$/gm`)
2. Render as a floating panel with hierarchical list
3. Click heading → smooth scroll to the corresponding heading in the article
4. `IntersectionObserver` tracks which heading is in view → highlights active TOC item

### Implementation Points

**Heading ID generation**:
Add `id` attributes to headings rendered by `MarkdownRenderer`. Strategy: slugify heading text (lowercase, replace spaces/special chars with `-`). Applied via `react-markdown` custom component for `h2`/`h3`.

**TOC extraction**:
Client-side function that parses markdown string, returns `[{ level: 2|3, text: string, id: string }]`.

**Scroll behavior**:
- TOC items rendered as `<a href="#heading-id">` or buttons with `element.scrollIntoView({ behavior: 'smooth' })`
- Heading IDs must match between TOC items and rendered headings

**Active highlight**:
- `IntersectionObserver` on all `h2`/`h3` elements within `.articleBody`
- Track which heading has the highest intersection ratio
- Apply active style (left border accent) to the corresponding TOC item

### Visual Design
```
┌─────────────┐
│ 📑 在本页中   │
├─────────────┤
│ 概述         │  ← h2
│ 核心概念      │  ← h2 (active, accent left border)
│   知识图谱    │  ← h3 (indented)
│   提取流程    │  ← h3
│ 常见问题      │  ← h2
└─────────────┘
```

### CSS
- Position: `fixed` or `sticky` so it stays visible while scrolling
- Max height: `calc(100vh - var(--komo-topnav-height) - 64px)`, overflow-y auto
- Width: ~200px
- h2 items: normal weight, indented 0
- h3 items: smaller font, indented 16px
- Active item: `border-left: 2px solid var(--komo-accent)`, text color accent
- Semi-transparent/hidden on narrow viewports (<1200px)

### When TOC is Empty
If article has no `##`/`###` headings → TOC panel shows "暂无标题" placeholder or hides entirely.

### Right Panel Changes
Right panel retains metadata, links, embed/merge, delete. TOC lives separately on the left.

---

## Files to Touch

| File | Change |
|------|--------|
| `app/knowledge/import/page.tsx` | NEW — import page |
| `app/knowledge/import/page.module.css` | NEW — import page styles |
| `app/page.tsx` | Enable "导入" button, link to `/knowledge/import` |
| `app/article/[id]/page.tsx` | Add TOC extraction logic, IntersectionObserver, render floating TOC |
| `app/article/[id]/page.module.css` | Add TOC floating panel styles |
| `components/MarkdownRenderer/MarkdownRenderer.tsx` | Custom h2/h3 with `id` attributes |
| `package.json` / install | No new dependencies needed |

## Not in Scope
- Image upload/replacement during import (Phase C)
- Batch import of multiple .md files
- .md export
- TOC for edit page
