import type { DraftData } from '@komo/shared/api-client';

export interface DraftParent {
  id: string;
  title: string;
}

export function readDraftRelation(draft: DraftData): {
  parentEntryId?: string; matchedEntryId?: string; matchedDraftId?: string;
} {
  if (!draft.relationDetail) return {};
  try {
    const detail = JSON.parse(draft.relationDetail);
    const id = (value: unknown) => typeof value === 'string' && value.length > 0 ? value : undefined;
    return {
      parentEntryId: draft.relationType === 'SUPPLEMENTS' ? id(detail?.parentEntryId) : undefined,
      matchedEntryId: id(detail?.matchedEntryId),
      matchedDraftId: id(detail?.matchedDraftId),
    };
  } catch (err) {
    console.warn('草稿关系信息解析失败', err);
    return {};
  }
}

// undefined 表示采用建议，null 表示用户明确取消；取消后不能重新回到建议。
export function resolveDraftParent(draft: DraftData, selection: DraftParent | null | undefined): DraftParent | null {
  if (selection !== undefined) return selection;
  const { parentEntryId } = readDraftRelation(draft);
  return parentEntryId ? { id: parentEntryId, title: '建议关联的文章' } : null;
}

export function draftDestination(draft: DraftData, selection: DraftParent | null | undefined, knowledgeBaseId?: string) {
  const parent = resolveDraftParent(draft, selection);
  return parent ? { parentEntryId: parent.id, knowledgeBaseId: undefined }
    : { parentEntryId: undefined, knowledgeBaseId };
}

/** 每条使用同一套目标参数；仅返回成功的 ID，失败内容必须留在页面。 */
export async function processDraftSelection(
  drafts: DraftData[],
  process: (draft: DraftData) => Promise<unknown>,
): Promise<{ succeeded: Set<string>; failed: string[] }> {
  const succeeded = new Set<string>();
  const failed: string[] = [];
  for (const draft of drafts) {
    try {
      await process(draft);
      succeeded.add(draft.id);
    } catch (err) {
      console.warn('处理草稿失败', draft.id, err);
      failed.push(draft.id);
    }
  }
  return { succeeded, failed };
}
