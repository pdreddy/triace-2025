// Server-only: captain codes for recovering a team on a new device. Only the hash is stored.
import { createHash, randomInt } from 'node:crypto';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCaptainCode() {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}
export const hashCaptainCode = code => createHash('sha256').update(String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');
