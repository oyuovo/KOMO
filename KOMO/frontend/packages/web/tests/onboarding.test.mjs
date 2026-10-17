import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOnboardingStep } from '../src/lib/onboarding.ts';

test('confirmed knowledge completes onboarding even after every draft is processed', () => {
  assert.equal(resolveOnboardingStep(1, 0, 1), null);
});
test('imported knowledge also completes onboarding without a conversation', () => {
  assert.equal(resolveOnboardingStep(0, 0, 1), null);
});
test('pending drafts lead to confirmation, including after the source chat is deleted', () => {
  assert.equal(resolveOnboardingStep(1, 1, 0), 3);
  assert.equal(resolveOnboardingStep(0, 1, 0), 3);
});
test('a new user starts at conversation and moves to extraction', () => {
  assert.equal(resolveOnboardingStep(0, 0, 0), 1);
  assert.equal(resolveOnboardingStep(1, 0, 0), 2);
});
