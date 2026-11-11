// Is this caller an administrator *right now*? The ID token carries an `admin` claim, but a token stays valid for up to an hour
// after an admin is removed. The account record is the truth: it must still carry the claim, not be disabled, and the token must
// not have been issued before the account's sessions were revoked (removeAdmin revokes them).
export function adminStatus(user, token = {}) {
  if (!user) return { admin: false, reason: 'unknown-account' };
  if (user.disabled) return { admin: false, reason: 'disabled' };
  if (user.customClaims?.admin !== true) return { admin: false, reason: 'not-admin' };
  const validAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
  const issued = Number(token.iat) * 1000;
  if (Number.isFinite(validAfter) && validAfter > 0 && Number.isFinite(issued) && issued < validAfter - 1000) return { admin: false, reason: 'revoked' };
  return { admin: true, reason: 'ok' };
}
