// Player accounts are separate from TRIACE captain accounts. Roles never grant organizer access.
export const PLAYER_LOGIN_DOMAIN = 'player.traice.local';
export const playerLoginEmail = username => `${String(username).trim().toLowerCase()}@${PLAYER_LOGIN_DOMAIN}`;
export const isPlayerEmail = email => typeof email === 'string' && email.toLowerCase().endsWith(`@${PLAYER_LOGIN_DOMAIN}`);
