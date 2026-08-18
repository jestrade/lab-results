import { describe, expect, it } from 'vitest';

import { ADMIN_HOME, USER_HOME, landingPathFor } from './landing';

describe('landingPathFor', () => {
  it('sends an admin to the system overview', () => {
    expect(landingPathFor('admin')).toBe(ADMIN_HOME);
  });

  it('sends a reader to their own results', () => {
    expect(landingPathFor('user')).toBe(USER_HOME);
  });

  it('treats an unresolved role as a reader, not as an admin', () => {
    // A session in the middle of resolving reports null. Defaulting the
    // unknown case to the privileged screen would flash the admin dashboard
    // at everybody on every sign-in.
    expect(landingPathFor(null)).toBe(USER_HOME);
    expect(landingPathFor(undefined)).toBe(USER_HOME);
  });
});
