// The formats PPRC offers. Player Home, the header and the router all read this list, so adding a format is one entry
// here plus its routes. `soon` formats get a disabled card and a reserved Coming Soon route, nothing else.
export const MODULES = [
  { id: 'triace', name: 'TRIACE 2.0', path: '/triace', status: 'active', tagline: 'Teams, tiers, fixtures and results' },
  { id: 'ladder', name: 'Singles Ladder', path: '/ladder', status: 'active', tagline: 'Challenge, compete and climb' },
  { id: 'po', name: 'PO', path: '/po', status: 'soon', tagline: 'Coming soon' },
  { id: 'koc', name: 'KOC', path: '/koc', status: 'soon', tagline: 'Coming soon' }
];
// Which format a URL belongs to: 'home' for Player Home, a module id for its own paths, otherwise TRIACE (every
// existing TRIACE route keeps its address: /tiers, /league, /team/..., /admin, ...).
export function moduleForPath(path) {
  if (path === '/' || path === '/home' || path === '/player-login') return 'home';
  const found = MODULES.find(m => m.id !== 'triace' && (path === m.path || path.startsWith(`${m.path}/`)));
  return found ? found.id : 'triace';
}
