import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOnboardingStep } from '../src/lib/onboarding.ts';

test('reading onboarding starts with a document and does not infer learning completion', () => {
  assert.equal(resolveOnboardingStep(0), 1);
  assert.equal(resolveOnboardingStep(1), 2);
});
