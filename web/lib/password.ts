// Shared password policy (#160). One place so signup and any future
// password-change flow enforce the same rule.
export const PASSWORD_MIN_LENGTH = 10;

// Returns a human-readable error when the password is too weak, or null when it
// satisfies the policy: at least PASSWORD_MIN_LENGTH characters, with a mix of
// lower-case, upper-case, and a digit.
export function validatePassword(pw: string): string | null {
  const v = pw ?? '';
  if (v.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (/[a-z]/.test(v) === false) return 'Include at least one lower-case letter.';
  if (/[A-Z]/.test(v) === false) return 'Include at least one upper-case letter.';
  if (/[0-9]/.test(v) === false) return 'Include at least one number.';
  return null;
}
