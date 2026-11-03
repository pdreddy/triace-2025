import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from './UI';
import { teamName, playerName } from './League';
import { formatUtr, parseUtr, DEFAULT_LEAGUE_RULES } from '../../functions/lib/tournament.js';
import { ROLES, playoffSpots, singlesEligibility, standings } from '../../functions/lib/league.js';

// Every league rule the admin controls. The rules cards, registration, standings and playoffs read these.
export function LeagueRulesCard({ rules = DEFAULT_LEAGUE_RULES, busy, onSave }) {
  const toDraft = r => ({ ...r, utrGapLimit: formatUtr(r.utrGapLimit) });
  const [draft, setDraft] = useState(() => toDraft(rules)), [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(toDraft(rules)); }, [rules, dirty]);
  const set = (key, value) => { setDraft(old => ({ ...old, [key]: value })); setDirty(true); };
  const number = key => ({ value: draft[key], onChange: e => set(key, e.target.value) });
  async function save(event) {
    event.preventDefault();
    let gap; try { gap = parseUtr(draft.utrGapLimit); } catch { gap = -1; }
    const ok = await onSave({ utrGapLimit: gap, pointsPerWin: Number(draft.pointsPerWin), playoffThreshold: Number(draft.playoffThreshold), playoffSpotsLarge: Number(draft.playoffSpotsLarge), playoffSpotsSmall: Number(draft.playoffSpotsSmall), singlesMinPercent: Number(draft.singlesMinPercent) });
    if (ok) setDirty(false);
  }
  const spots = key => <select id={key} value={draft[key]} onChange={e => set(key, e.target.value)}>{[2, 3, 4].map(n => <option key={n} value={n}>Top {n}</option>)}</select>;
  return (
    <form className="card" onSubmit={save} aria-label="League rules">
      <div className="card-head"><h3>League rules</h3><span className="pill">{dirty ? 'Unsaved' : 'Saved'}</span></div>
      <p className="small note">These values drive the rules cards, registration ratings, standings, playoff spots and the singles check. Saved changes show everywhere immediately; run Recalculate Tiers after changing the gap so existing teams are re-rated.</p>
      <fieldset disabled={busy} className="rules-grid">
        <Field id="rule-gap" label="Singles/doubles gap before averaging (UTR)" type="number" min="0" max="16.5" step="0.01" required {...number('utrGapLimit')} />
        <Field id="rule-points" label="Points per encounter win" type="number" min="1" max="10" step="1" required {...number('pointsPerWin')} />
        <Field id="rule-singles" label="Singles minimum (% of match days)" type="number" min="0" max="100" step="1" required {...number('singlesMinPercent')} />
        <Field id="rule-threshold" label="Larger playoff above this many teams" type="number" min="2" max="64" step="1" required {...number('playoffThreshold')} />
        <div className="field"><label htmlFor="playoffSpotsLarge">Playoff spots above the threshold</label>{spots('playoffSpotsLarge')}</div>
        <div className="field"><label htmlFor="playoffSpotsSmall">Playoff spots at or below it</label>{spots('playoffSpotsSmall')}</div>
      </fieldset>
      <button className="button small" disabled={busy || !dirty}>Save league rules</button>
    </form>
  );
}

export function SeasonCard({ season, seasons, busy, onRename, onArchive }) {
  const [name, setName] = useState(season.name), [next, setNext] = useState(''), [confirm, setConfirm] = useState('');
  useEffect(() => setName(season.name), [season.name]);
  const archived = Object.values(seasons || {}).sort((a, b) => b.archivedAt - a.archivedAt);
  return (
    <section className="card season-card">
      <div className="card-head"><h3>Season</h3><Link className="text-link" to="/history">Past seasons ({archived.length}) ↗</Link></div>
      <div className="inline-form">
        <Field id="season-name" label="Current season name" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
        <button type="button" className="secondary small" disabled={busy || !name.trim() || name.trim() === season.name} onClick={() => onRename(name.trim())}>Rename</button>
      </div>
      <details className="danger-zone">
        <summary>Close this season and start a new one</summary>
        <p className="small">Saves the season to the history (teams, fixtures, standings, playoffs and champions), keeps a private copy of the registrations, then clears teams and fixtures so registration can start again. Settings, tiers and league rules stay.</p>
        <Field id="season-next" label="Next season name" maxLength={60} placeholder={`e.g. ${new Date().getFullYear() + 1} season`} value={next} onChange={e => setNext(e.target.value)} />
        <Field id="season-confirm" label={`Type “${season.name}” to confirm`} value={confirm} onChange={e => setConfirm(e.target.value)} />
        <button type="button" className="danger" disabled={busy || !next.trim() || confirm !== season.name} onClick={async () => { if (await onArchive(next.trim(), confirm)) { setNext(''); setConfirm(''); } }}>Close season &amp; start next</button>
      </details>
    </section>
  );
}

const SLOT_HINTS = {
  4: ['Seed 1 · Semifinal 1', 'Seed 2 · Semifinal 2', 'Seed 3 · plays seed 1', 'Seed 4 · plays seed 2'],
  3: ['Seed 1 · straight to the final', 'Seed 2 · Eliminator', 'Seed 3 · Eliminator v seed 2'],
  2: ['Finalist 1', 'Finalist 2']
};

// Manual playoff mapping: pick the bracket size and the team in every slot. Prefilled from the standings.
export function PlayoffPlanner({ tier, data, rules, busy, onCreate }) {
  const fixtures = data?.fixtures?.[tier.id] || {}, teams = Object.values(data?.tiers?.[tier.id]?.teams || {});
  const table = standings(teams, fixtures, rules), byId = new Map(teams.map(t => [t.teamId, t]));
  const existing = Object.values(fixtures).filter(f => f.stage).sort((a, b) => a.order - b.order);
  const suggested = Math.max(2, Math.min(4, playoffSpots(table.length, rules)));
  const [size, setSize] = useState(suggested), [seeds, setSeeds] = useState(() => table.slice(0, 4).map(r => r.team.teamId));
  useEffect(() => { setSeeds(old => (old.filter(Boolean).length ? old : table.slice(0, 4).map(r => r.team.teamId))); }, [table.length]);
  const chosen = seeds.slice(0, size), unfinished = Object.values(fixtures).filter(f => !f.stage && f.status !== 'final').length;
  const duplicate = new Set(chosen).size !== chosen.length || chosen.some(id => !id);
  const warnings = chosen.filter(Boolean).flatMap(id => {
    const check = singlesEligibility(id, fixtures, rules);
    return ROLES.filter(r => !check.players[r].met).map(r => `${playerName(byId.get(id), r)} (${teamName(byId.get(id))}): ${check.players[r].days} of ${check.required} singles days`);
  });
  if (teams.length < 2) return null;
  return (
    <div className="playoff-planner">
      <h4>Playoffs</h4>
      {existing.length > 0 && <p className="small">Current bracket: {existing.map(f => `${f.label}: ${teamName(byId.get(f.home))} v ${teamName(byId.get(f.away))}`).join(' · ')}</p>}
      <div className="field"><label htmlFor={`${tier.id}-po-size`}>Bracket</label>
        <select id={`${tier.id}-po-size`} value={size} onChange={e => setSize(Number(e.target.value))}>
          {[4, 3, 2].filter(n => n <= teams.length).map(n => <option key={n} value={n}>{n === 4 ? 'Top 4: semifinals, then final' : n === 3 ? 'Top 3: eliminator, then final' : 'Top 2: final only'}{n === suggested ? ' (rules)' : ''}</option>)}
        </select>
      </div>
      <div className="slot-grid">
        {SLOT_HINTS[size].map((hint, i) => (
          <div className="field" key={hint}>
            <label htmlFor={`${tier.id}-seed-${i}`}>{hint}</label>
            <select id={`${tier.id}-seed-${i}`} value={seeds[i] || ''} onChange={e => setSeeds(old => { const copy = [...old]; copy[i] = e.target.value; return copy; })}>
              <option value="" disabled>Choose a team…</option>
              {table.map(r => <option key={r.team.teamId} value={r.team.teamId}>#{r.position} {teamName(r.team)} · {r.points} pts</option>)}
            </select>
          </div>
        ))}
      </div>
      {unfinished > 0 && <p className="small warn-text">{unfinished} round-robin results are not final yet; the standings may still change.</p>}
      {warnings.length > 0 && <div className="small warn-text"><strong>Below the singles minimum:</strong><ul>{warnings.map(w => <li key={w}>{w}</li>)}</ul></div>}
      {duplicate && <p className="small warn-text">Choose a different team for every slot.</p>}
      <button type="button" className="button small" disabled={busy || duplicate} onClick={() => onCreate(chosen, existing.some(f => f.result || f.submission))}>{existing.length ? 'Replace playoffs' : 'Create playoffs'}</button>
    </div>
  );
}
