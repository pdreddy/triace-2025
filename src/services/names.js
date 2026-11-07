// One spelling of every player's name across the site. Season 1 was typed by hand ("Hari", "Raj C", "Sandeep G"),
// so each name is matched to the shared PPRC player list: first by the decisions made during the migration
// (team + name), then by the PPRC list itself when exactly one player fits. A name that cannot be matched
// safely is shown as it was written. Matched players link to their public PPRC profile.
import { useEffect, useState } from 'react';
import { makeResolver } from '../data/nameResolver.js';
import { fetchPlayerList } from './pprc.js';

let loading = null;
const listOnce = () => (loading ||= fetchPlayerList().catch(() => { loading = null; return []; }));
export { makeResolver };

// A resolver that starts with the migration decisions and gets the PPRC list as soon as it has loaded.
export function useNameResolver() {
  const [resolve, setResolve] = useState(() => makeResolver());
  useEffect(() => {
    let live = true;
    listOnce().then(list => { if (live && list.length) setResolve(() => makeResolver(list)); });
    return () => { live = false; };
  }, []);
  return resolve;
}
