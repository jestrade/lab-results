import { describe, expect, it } from 'vitest';

import { __messagesForTests, toAuthErrorMessage } from './authErrors';

describe('toAuthErrorMessage', () => {
  it('does not reveal whether an account exists', () => {
    // The whole point: a wrong password and an unknown address must be
    // indistinguishable, or the sign-in form becomes an account-enumeration
    // oracle.
    const wrongPassword = toAuthErrorMessage({ code: 'auth/wrong-password' });
    const noSuchUser = toAuthErrorMessage({ code: 'auth/user-not-found' });
    const invalid = toAuthErrorMessage({ code: 'auth/invalid-credential' });

    expect(wrongPassword.message).toBe(noSuchUser.message);
    expect(invalid.message).toBe(noSuchUser.message);
  });

  it('offers a password reset when credentials are rejected', () => {
    expect(toAuthErrorMessage({ code: 'auth/invalid-credential' }).action).toBe('reset-password');
  });

  it('explains account linking rather than just failing', () => {
    const linked = toAuthErrorMessage({
      code: 'auth/account-exists-with-different-credential',
    });
    expect(linked.action).toBe('sign-in-with-password');
    expect(linked.message).toContain('already has a password account');
  });

  it('points a disabled account at support', () => {
    expect(toAuthErrorMessage({ code: 'auth/user-disabled' }).action).toBe('contact-support');
  });

  it('falls back to a generic message for an unrecognised code', () => {
    const unknown = toAuthErrorMessage({ code: 'auth/some-future-code' });
    expect(unknown.message).toContain('Something went wrong');
  });

  it('survives a thrown value that is not a Firebase error at all', () => {
    expect(toAuthErrorMessage(new Error('boom')).message).toContain('Something went wrong');
    expect(toAuthErrorMessage(undefined).message).toContain('Something went wrong');
    expect(toAuthErrorMessage('a string').message).toContain('Something went wrong');
  });

  it('never leaks a raw Firebase code to the user', () => {
    for (const message of Object.values(__messagesForTests)) {
      expect(message.message).not.toMatch(/auth\//);
    }
  });
});
