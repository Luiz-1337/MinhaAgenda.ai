import { describe, expect, it } from 'vitest';
import { getSessionErrorReason, isSessionError } from '@/lib/services/evolution-message.service';

describe('evolution-message session error classification', () => {
  it('detects no session record', () => {
    const error = new Error('No session record for this contact');

    expect(isSessionError(error)).toBe(true);
    expect(getSessionErrorReason(error)).toBe('no_session_record');
  });

  it('detects bad mac', () => {
    const error = new Error('Bad MAC while decrypting message');

    expect(isSessionError(error)).toBe(true);
    expect(getSessionErrorReason(error)).toBe('bad_mac');
  });

  it('detects nested session error in cause', () => {
    const error = new Error('wrapper error') as Error & { cause?: unknown };
    error.cause = new Error('SessionError: no valid session');

    expect(isSessionError(error)).toBe(true);
    expect(getSessionErrorReason(error)).toBe('session_error');
  });

  it('does not classify unrelated errors as session errors', () => {
    const error = new Error('Socket hang up');

    expect(isSessionError(error)).toBe(false);
    expect(getSessionErrorReason(error)).toBeNull();
  });
});
