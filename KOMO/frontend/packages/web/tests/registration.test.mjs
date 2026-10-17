import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationError } from '../src/lib/registration.ts';

test('registration matches backend length and letter/digit rules', () => {
  for (const password of ['123123', 'abcdefgh', '12345678', 'a1' + 'x'.repeat(99)]) {
    assert.ok(registrationError(password, password));
  }
  assert.equal(registrationError('test1234', 'test1234'), null);
  const longest = 'a1' + 'x'.repeat(98);
  assert.equal(registrationError(longest, longest), null);
});
test('password confirmation must match', () => {
  assert.match(registrationError('test1234', 'different123'), /不一致/);
});
