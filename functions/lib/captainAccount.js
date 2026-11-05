// Browser-safe parts of captain logins (no Node crypto): the made-up email address behind a username.
export const LOGIN_DOMAIN = 'captain.traice.local';
export const captainUid = teamId => `cap_${teamId}`;
export const loginEmail = username => `${String(username).trim().toLowerCase()}@${LOGIN_DOMAIN}`;
export const isCaptainEmail = email => typeof email === 'string' && email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`);
export const usernameFrom = email => String(email || '').split('@')[0];
