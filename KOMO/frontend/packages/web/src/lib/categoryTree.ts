import type { CategoryData } from '@komo/shared/api-client';

export interface CategoryTreeRow {
  category: CategoryData;
  depth: number;
  hasChildren: boolean;
}

// path 保存祖先，当前节点的完整路径还要追加经过 ltree 转义的 ID。
function fullPath(category: CategoryData): string {
  return `${category.path || 'root'}.${category.id.replace(/-/g, '_')}`;
}

export function isCategoryDescendant(category: CategoryData, ancestor: CategoryData): boolean {
  const prefix = fullPath(ancestor);
  const path = category.path || 'root';
  return path === prefix || path.startsWith(prefix + '.');
}

export function getSubtreeCategoryIds(rootId: string, categories: readonly CategoryData[]): Set<string> {
  const root = categories.find(category => category.id === rootId);
  const ids = new Set([rootId]);
  if (root) {
    for (const category of categories) {
      if (isCategoryDescendant(category, root)) ids.add(category.id);
    }
  }
  return ids;
}

/** 父节点后紧跟其子树；同级按 sortOrder 排序，同序时以 ID 保持稳定。 */
export function flattenCategoryTree(
  categories: readonly CategoryData[],
  expandedIds?: ReadonlySet<string>,
): CategoryTreeRow[] {
  const paths = new Set(categories.map(fullPath));
  const childrenByPath = new Map<string, CategoryData[]>();
  const roots: CategoryData[] = [];
  const sorted = [...categories].sort((a, b) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const category of sorted) {
    const parentPath = category.path || 'root';
    if (!paths.has(parentPath)) {
      // 缺失父节点的历史分类仍展示为根，其后代按实际展示层级缩进。
      roots.push(category);
    } else {
      const siblings = childrenByPath.get(parentPath) ?? [];
      siblings.push(category);
      childrenByPath.set(parentPath, siblings);
    }
  }

  const rows: CategoryTreeRow[] = [];
  const append = (category: CategoryData, depth: number) => {
    const children = childrenByPath.get(fullPath(category)) ?? [];
    rows.push({ category, depth, hasChildren: children.length > 0 });
    if (!expandedIds || expandedIds.has(category.id)) {
      for (const child of children) append(child, depth + 1);
    }
  };
  for (const root of roots) append(root, 0);
  return rows;
}
