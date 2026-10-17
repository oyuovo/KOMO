export type GuideStep = 1 | 2 | 3;

/** 已有入库知识是完成标志，待审草稿清空不能让引导倒退。 */
export function resolveOnboardingStep(conversationCount: number, draftCount: number, knowledgeCount: number): GuideStep | null {
  if (knowledgeCount > 0) return null;
  if (draftCount > 0) return 3;
  return conversationCount > 0 ? 2 : 1;
}
