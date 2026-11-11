// The badges on a PPRC profile: verified or NR, the club seasons played (KOC S2, KOC S3, Triace S1) and a few
// earned ones (star player of a club, specialist, hot streak). Pure, so the browser and the tests share it.
import { PPRC_VERIFIED_AFTER } from './tournament.js';

const CLUB_NAMES = { koc: 'KOC', triace: 'Triace', ladder: 'Ladder' };
const clubLabel = id => CLUB_NAMES[id] || String(id).toUpperCase();
// KOC S3, Triace S1; a year-named competition reads "Ladder 2026".
export const seasonLabel = (club, season) => (/^y\d{4}$/i.test(String(season)) ? `${clubLabel(club)} ${String(season).slice(1)}` : `${clubLabel(club)} S${String(season).replace(/^s/i, '')}`);
export const courtsPlayed = rating => (rating?.played?.singles || 0) + (rating?.played?.doubles || 0);
export const isVerified = rating => courtsPlayed(rating) > PPRC_VERIFIED_AFTER;

// rank: { koc: 3, triace: 12 }, the player's place among the verified players of each club (see clubRanks).
export function clubRanks(list, id) {
  const out = {};
  for (const club of ['koc', 'triace']) { // the ladder has its own table; stars are for the team clubs
    const pool = list.filter(p => (p.clubs || []).includes(club) && p.played > PPRC_VERIFIED_AFTER).sort((a, b) => b.overall - a.overall);
    const at = pool.findIndex(p => p.id === id);
    if (at >= 0) out[club] = at + 1;
  }
  return out;
}

export function playerBadges({ rating, info, recent = [], rank = {} }) {
  if (!rating) return [];
  const badges = [];
  const seasons = Object.values(rating.seasons || {});
  const fromRecent = [...new Map(recent.map(h => [`${h.club}_${h.season}`, { club: h.club, season: h.season }])).values()];
  for (const x of (seasons.length ? seasons : fromRecent).sort((a, b) => `${a.club}${a.season}`.localeCompare(`${b.club}${b.season}`))) {
    const label = seasonLabel(x.club, x.season);
    badges.push({ key: `season-${x.club}-${x.season}`, kind: 'season', club: x.club, label, ...(x.club === 'ladder' ? { icon: 'ladder' } : {}), title: `Played in ${label}` });
  }
  const clubs = Object.keys(info?.clubs || {});
  if (clubs.length > 1) badges.push({ key: 'multi', kind: 'earned', label: 'Multi-club', title: `Has played for ${clubs.map(clubLabel).join(' and ')}` });
  for (const [club, place] of Object.entries(rank)) {
    if (place <= 3) badges.push({ key: `star-${club}`, kind: 'star', label: `★ ${clubLabel(club)} star #${place}`, title: `Number ${place} among verified ${clubLabel(club)} players by PPRC rating` });
    else if (place <= 10) badges.push({ key: `top-${club}`, kind: 'earned', label: `${clubLabel(club)} top 10`, title: `Number ${place} among verified ${clubLabel(club)} players by PPRC rating` });
  }
  if (isVerified(rating)) {
    const gap = rating.doubles - rating.singles;
    if (rating.played.singles >= 3 && rating.played.doubles >= 3) {
      if (gap >= 0.3) badges.push({ key: 'doubles', kind: 'earned', label: 'Doubles specialist', title: 'Rated clearly higher in doubles than in singles' });
      else if (gap <= -0.3) badges.push({ key: 'singles', kind: 'earned', label: 'Singles specialist', title: 'Rated clearly higher in singles than in doubles' });
    }
    const last = [...recent].slice(0, 5);
    if (last.length === 5 && last.every(h => h.won)) badges.push({ key: 'streak', kind: 'earned', label: 'On a 5-court streak', title: 'Won the latest five courts' });
    for (const type of ['singles', 'doubles']) {
      const r = rating.record?.[type];
      if (r && r.wins >= 5 && r.losses === 0) badges.push({ key: `unbeaten-${type}`, kind: 'earned', label: `Unbeaten in ${type}`, title: `${r.wins}–0 in ${type}` });
    }
  }
  return badges;
}
