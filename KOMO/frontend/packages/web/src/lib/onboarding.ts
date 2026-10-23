export type GuideStep = 1 | 2;

/** Having a document is not evidence that a user has read or edited it. */
export function resolveOnboardingStep(knowledgeCount: number): GuideStep {
  return knowledgeCount > 0 ? 2 : 1;
}
