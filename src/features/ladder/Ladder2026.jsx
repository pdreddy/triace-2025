// Ladder 2026 as it was played: four round-robin groups and the playoffs. Read-only, from the results table kept in
// the repo (scripts/migration/ladder-2026.psv, the same file the PPRC ratings use), with every player shown under
// their settled PPRC name and linked to their PPRC profile. Nothing here is typed by hand.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ladderSeason } from '../../../functions/lib/ladder.js';
import { playerIdFor } from '../../../functions/lib/pprc.js';
import results from '../../../scripts/migration/ladder-2026.psv?raw';
import decisions from '../../../scripts/migration/name-decisions.json';
import { EmptyState } from '../../components/UI';
import { Icon } from '../../components/Icons';
import { Chip } from './ui';

const Player = ({ who, won }) => <Link className={`l26-player${won ? ' won' : ''}`} to={`/pprc/${playerIdFor(who.name)}`}>{who.name}</Link>;
const NOTE = { tie: 'Tie', walkover: 'Walkover', bye: 'Bye' };
function Match({ match: m }) {
  return (
    <li className="l26-match">
      <span className="l26-round">{m.playoff ? m.round : m.week ? `Week ${m.week}` : m.round}</span>
      <span className="l26-pair"><Player who={m.home} won={m.winner === 'home'} /> <i>v</i> <Player who={m.away} won={m.winner === 'away'} /></span>
      <span className="l26-score">{m.sets || NOTE[m.kind]}{/exception/i.test(m.stage) && <Chip>Exception</Chip>}{!m.confirmed && <Chip tone="warn">Awaiting confirmation</Chip>}</span>
    </li>
  );
}
export default function Ladder2026() {
  const season = useMemo(() => ladderSeason(results, decisions), []), [tab, setTab] = useState('champions');
  const group = season.groups.find(g => g.name === tab);
  return (
    <section className="page ladder-screen">
      <header className="ladder-head"><div><p className="eyebrow">PPRC Singles Ladder</p><h1>Ladder 2026</h1></div><div className="ladder-head-side"><Chip tone={season.champion ? 'good' : 'sky'}>{season.champion ? 'Complete' : 'Playoffs in progress'}</Chip></div></header>
      <p className="lmeta">{season.players} players · {season.matches} results · four round-robin groups, then playoffs.</p>
      <div className="org-tabs" role="tablist" aria-label="Ladder 2026 sections">
        {['champions', ...season.groups.map(g => g.name)].map(id => <button key={id} role="tab" type="button" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{id === 'champions' ? 'Champions & playoffs' : id}</button>)}
      </div>
      {tab === 'champions' ? <>
        <div className="lcard l26-champion">
          <Icon name="trophy" size={40} />
          {season.champion ? <div><h2>{season.champion.name}</h2><p>Ladder 2026 champion · runner-up <Player who={season.runnerUp} /></p></div>
            : <div><h2>Champion to be decided</h2><p>The playoffs are still being played. The champion appears here as soon as the final result is confirmed.</p></div>}
        </div>
        <h2 className="lsection">Playoffs</h2>
        {season.playoffs.length ? <ul className="l26-list">{season.playoffs.map(m => <Match key={m.id} match={m} />)}</ul> : <EmptyState icon="trophy" title="No playoff results yet">Playoff matches appear here as they are played.</EmptyState>}
        <h2 className="lsection">Group leaders</h2>
        <div className="rules-grid">{season.groups.map(g => <button type="button" className="lcard l26-leader" key={g.name} onClick={() => setTab(g.name)}><small>{g.name}</small><strong>{g.players[0].name}</strong><span>{g.players[0].won}–{g.players[0].lost}{g.players[0].tied ? `–${g.players[0].tied}` : ''} · view group →</span></button>)}</div>
        <p className="lmeta">Group order is by confirmed wins, then fewest losses. It is a record of results, not an official tie-break.</p>
      </> : <>
        <h2 className="lsection">{group.name} record</h2>
        <ol className="ladder-list" aria-label={`${group.name} record`}>{group.players.map((p, i) => (
          <li key={p.key} className="ladder-row l26-row"><span className="lrank">{i + 1}</span><div className="lwho"><strong><Link to={`/pprc/${playerIdFor(p.name)}`}>{p.name}</Link></strong></div>
            <div className="lnums"><b>{p.won}</b><small>won</small></div><div className="lnums"><b>{p.lost}</b><small>lost</small></div><div className="lnums"><b>{p.tied}</b><small>tied</small></div></li>
        ))}</ol>
        <h2 className="lsection">{group.name} results by week</h2>
        <ul className="l26-list">{group.matches.map(m => <Match key={m.id} match={m} />)}</ul>
      </>}
    </section>
  );
}
