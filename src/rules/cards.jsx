import { Icon } from '../components/Icons';
import { UtrMeter } from '../components/UI';
import { formatUtr, orderedTiers, DEFAULT_TIERS, DEFAULT_LEAGUE_RULES } from '../../functions/lib/tournament.js';

// Minimum singles days for a few season lengths, grouped where the answer is the same.
function singlesTable(percent) {
  const rows = [];
  for (let days = 5; days <= 12; days++) {
    const need = Math.floor((days * percent) / 100), last = rows.at(-1);
    if (last && last.need === need && days !== 8 && last.to !== 8) last.to = days; else rows.push({ from: days, to: days, need });
  }
  return rows;
}

function Head({ num, title, note }) {
  return (
    <header className="rule-head">
      <span className="rule-num">{num}</span>
      <h2>{title}</h2>
      {note && <span className="pill warn">{note}</span>}
    </header>
  );
}

function Seats({ filled, total }) {
  return (
    <span className="seats" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
    </span>
  );
}

function Ring({ percent, label }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 100 100" role="img" aria-label={`${percent}% ${label}`}>
      <circle className="ring-track" cx="50" cy="50" r={r} />
      <circle className="ring-fill" cx="50" cy="50" r={r} strokeDasharray={`${(c * percent) / 100} ${c}`} transform="rotate(-90 50 50)" />
      <text className="ring-value" x="50" y="52">{percent}%</text>
      <text className="ring-label" x="50" y="66">{label}</text>
    </svg>
  );
}

function Match({ title, seeds, final = false }) {
  return (
    <div className={`match${final ? ' final' : ''}`}>
      <span className="match-title">{final && <Icon name="trophy" size={14} />}{title}</span>
      {seeds.map(([seed, name]) => <span key={name} className="match-team">{seed && <b>{seed}</b>}{name}</span>)}
    </div>
  );
}

// The official Triace 2.0 rules, one flash card per entry, filled in from the admin's tier and
// league settings. Ratings are in hundredths of a UTR.
export function ruleCards(tierConfig = DEFAULT_TIERS, rules = DEFAULT_LEAGUE_RULES) {
  const tiers = orderedTiers(tierConfig, true).sort((a, b) => a.minCombinedUtr - b.minCombinedUtr);
  const configuredShowcase = orderedTiers(tierConfig, false).filter(t => t.id === 'rising' || t.id === 'goat');
  const showcase = (configuredShowcase.length ? configuredShowcase : orderedTiers(DEFAULT_TIERS, false)).sort((a, b) => a.minCombinedUtr - b.minCombinedUtr);
  const sampleRanges = !configuredShowcase.length;
  const rising = showcase.find(t => t.id === 'rising'), goat = showcase.find(t => t.id === 'goat');
  const sharedBoundary = rising && goat && rising.maxCombinedUtr === goat.minCombinedUtr && (sampleRanges || (rising.active && goat.active));
  const gap = formatUtr(rules.utrGapLimit), pct = rules.singlesMinPercent;
  const exampleDoubles = 500 + rules.utrGapLimit + 25, exampleAverage = Math.round((500 + exampleDoubles) / 2);
  const exampleNeed = Math.floor((8 * pct) / 100);
  return [
  {
    title: 'Triace 2.0',
    hero: true,
    body: (
      <>
        <p className="eyebrow">Official tournament rules</p>
        <h1 className="rule-title">Triace <em>2.0</em></h1>
        <p className="rule-lead">Three players per team. Three on court each week.</p>
        <div className="rule-stats">
          <div><b>3</b><span>players per team</span></div>
          <div><b>{tiers.length}</b><span>active {tiers.length === 1 ? 'tier' : 'tiers'}</span></div>
          <div><b>{pct}%</b><span>singles days per player</span></div>
          <div><b>Bo5</b><span>Best of 5 playoff matches. First to win 3 advances.</span></div>
        </div>
        <div className="hero-tier-meter">
          <strong className="rule-label">Find your team’s tier</strong>
          <div className="hero-tier-tiles">
            {showcase.map(t => <div key={t.id} className={`hero-tier-tile ${t.id}${t.active && !sampleRanges ? '' : ' inactive'}`}><strong>{t.name}</strong><span>{formatUtr(t.minCombinedUtr)}–{formatUtr(t.maxCombinedUtr)} combined UTR</span>{(sampleRanges || !t.active) && <small>{sampleRanges ? 'Example range · awaiting admin setup' : 'Currently closed'}</small>}</div>)}
          </div>
          <UtrMeter tiers={tiers.length ? tiers : showcase} />
          {sharedBoundary && <p className="rule-text">{sampleRanges ? 'Example automatic placement: ' : 'Automatic placement: '}Rising {formatUtr(rising.minCombinedUtr)}–{formatUtr(rising.maxCombinedUtr - 1)}; GOAT {formatUtr(goat.minCombinedUtr)}–{formatUtr(goat.maxCombinedUtr)}. At exactly {formatUtr(goat.minCombinedUtr)}, GOAT takes priority. A GOAT-qualified team may still choose Rising.</p>}
          {!sharedBoundary && <p className="rule-text">Your three players’ combined UTR determines which active tier you qualify for. Where ranges overlap, the higher-priority tier wins.</p>}
        </div>
        <p className="rule-hint">Swipe or tap Next to flip through every rule <Icon name="arrow" size={16} /></p>
      </>
    )
  },
  {
    title: 'Team composition',
    body: (
      <>
        <Head num="01" title="Team composition" />
        <div className="rule-grid three">
          {['P1', 'P2', 'P3'].map((p, i) => <div key={p} className="rule-box center"><span className="ball-badge">{p}</span><span className="rule-label">Player {i + 1}</span></div>)}
        </div>
        <div className="rule-box">
          <span className="rule-label">Each player’s UTR</span>
          <p className="formula">= the higher of <span className="chip on">Singles UTR</span> or <span className="chip on">Doubles UTR</span></p>
          <p className="rule-text">If singles and doubles are more than <strong>{gap} apart</strong>, the <strong>average</strong> of the two counts instead. Example: singles 5.00 and doubles {formatUtr(exampleDoubles)} → {formatUtr(exampleAverage)}.</p>
        </div>
      </>
    )
  },
  {
    title: 'UTR & tiers',
    body: (
      <>
        <Head num="02" title="Team UTR & tiers" />
        <p className="rule-text">Combined team UTR = P1 + P2 + P3, each counted by the rating rule on the previous card. Both ends of each range count; where ranges meet, the higher tier takes the team.</p>
        <UtrMeter tiers={tiers} />
        <div className="rule-box">
          <span className="rule-label">How teams are placed</span>
          <ul className="ticks">
            <li>Choose <strong>GOAT only</strong>, <strong>Rising only</strong>, <strong>both</strong>, or automatic placement in the highest eligible tier.</li>
            <li><strong>GOAT only</strong> requires a GOAT-qualifying UTR. A GOAT-only team stays in GOAT even if few teams register there.</li>
            <li>If you prefer GOAT, check <strong>“Rising is okay”</strong> to use Rising only when your UTR does not qualify for GOAT. This enters one tier, not both.</li>
            <li>GOAT-qualified teams may choose Rising; Rising-qualified teams cannot enter GOAT.</li>
            <li>If tier ranges overlap, the admin’s tier order decides placement.</li>
            <li>A team whose combined UTR is outside every active tier can’t register.</li>
          </ul>
        </div>
      </>
    )
  },
  {
    title: 'Match format',
    body: (
      <>
        <Head num="03" title="Match format · round robin" />
        <p className="rule-text">In round robin, <strong>each team meets every other team once</strong>; an odd number of teams means one bye per round. An encounter has <strong>three matches: Doubles 1, Doubles 2, then Singles</strong>. Win two of the three to win the encounter.</p>
        <p className="rule-text"><strong>Singles</strong> is one 8-game pro set (tiebreak at 7-7, so 8-7 is the longest). <strong>Doubles</strong> is best of three short sets to 4 games, with a 7-point tiebreak at 3-3. If the first two sets split, the third is a 10-point match tiebreak or a full short set. Tiebreak points never count as games.</p>
        <ol className="rule-steps three">
          <li><strong>Doubles 1</strong><span>Any two players pair up.</span><span className="chips"><span className="chip on">P1 + P2</span></span></li>
          <li><strong>Doubles 2</strong><span>The third player pairs with one of the Doubles 1 players. The Doubles 1 pair can’t play together again.</span><span className="chips"><span className="chip on">P1 + P3</span><span className="chip on">P2 + P3</span><span className="chip off">P1 + P2</span></span></li>
          <li><strong>Singles</strong><span>The player who sat out Doubles 2 plays the singles.</span><span className="chips"><span className="chip on">P2</span></span></li>
        </ol>
        <p className="rule-text">Example: P1 + P2 play Doubles 1, P1 + P3 play Doubles 2, and P2 plays Singles. P1 and P2 each play twice; P3 plays once.</p>
      </>
    )
  },
  {
    title: 'Playoff eligibility',
    body: (
      <>
        <Head num="04" title="Playoff eligibility" />
        <div className="rule-grid two">
          <div className="rule-box center">
            <Ring percent={pct} label="singles days" />
            <p className="rule-text">Every player must play <strong>singles</strong> on at least {pct}% of the team’s scheduled match days, <strong>rounded down</strong>.</p>
            <div className="calc"><span><b>8</b>match days</span><Icon name="arrow" size={16} /><span><b>{((8 * pct) / 100).toFixed(1)}</b>{pct}%</span><Icon name="arrow" size={16} /><span className="win"><b>{exampleNeed}</b>singles days</span></div>
          </div>
          <div className="rule-box">
            <span className="rule-label">Minimum singles days, per player</span>
            <table className="rule-table">
              <thead><tr><th scope="col">Match days</th><th scope="col">Singles needed</th></tr></thead>
              <tbody>
                {singlesTable(pct).map(r => <tr key={r.from} className={r.from === 8 ? 'hl' : ''}><td>{r.from === r.to ? r.from : `${r.from} – ${r.to}`}{r.from === 8 ? ' (example)' : ''}</td><td>{r.need}</td></tr>)}
              </tbody>
            </table>
            <p className="rule-warn"><Icon name="warn" size={18} />Rotate your singles players. Teams that miss the minimum won’t qualify for the playoffs.</p>
          </div>
        </div>
      </>
    )
  },
  {
    title: 'Qualification',
    body: (
      <>
        <Head num="05" title="Playoff qualification" />
        <div className="rule-grid two">
          <div className="rule-box qualify"><span className="rule-label">More than {rules.playoffThreshold} teams</span><b className="qualify-num">{rules.playoffSpotsLarge}</b><strong className="rule-big">Top {rules.playoffSpotsLarge} qualify</strong><Seats filled={rules.playoffSpotsLarge} total={rules.playoffThreshold + 1} /></div>
          <div className="rule-box qualify"><span className="rule-label">{rules.playoffThreshold} or fewer teams</span><b className="qualify-num">{rules.playoffSpotsSmall}</b><strong className="rule-big">Top {rules.playoffSpotsSmall} qualify</strong><Seats filled={rules.playoffSpotsSmall} total={rules.playoffThreshold} /></div>
        </div>
        <p className="rule-text">League standings: <strong>{rules.pointsPerWin} {rules.pointsPerWin === 1 ? 'point' : 'points'}</strong> per encounter win; ties break on head-to-head, then court difference, game difference and games won. Only approved results count.</p>
      </>
    )
  },
  {
    title: 'Challenge rule',
    body: (
      <>
        <Head num="05" title="The challenge rule" note="Provisional" />
        <p className="rule-text">We’ll review this rule before team enrolments are finalised.</p>
        <ol className="rule-steps">
          <li><strong>Be 5th or 6th</strong><span>Only the teams in 5th and 6th place can challenge.</span></li>
          <li><strong>No slippage</strong><span>You must have completed all scheduled weeks on time.</span></li>
          <li><strong>Beat the clock</strong><span>Challenge before the last 3 weeks of the season.</span></li>
          <li><strong>Once only</strong><span>Each team can use its challenge just once.</span></li>
        </ol>
      </>
    )
  },
  {
    title: 'Who can challenge',
    body: (
      <>
        <Head num="05" title="Who can challenge" note="Provisional" />
        <div className="rule-grid two">
          <div className="rule-box">
            <span className="rule-label">Who you can challenge</span>
            <ul className="ladder">
              <li className="safe"><b>1st</b>Safe – can’t be challenged<Icon name="lock" size={14} /></li>
              <li className="target"><b>2nd</b>Can be challenged</li>
              <li className="target"><b>3rd</b>Can be challenged</li>
              <li className="target"><b>4th</b>Can be challenged</li>
              <li className="challenger"><b>5th</b>Challenger</li>
              <li className="challenger"><b>6th</b>Challenger</li>
            </ul>
          </div>
          <div className="outcomes">
            <div className="outcome win"><strong>Win</strong><span>The two teams swap positions in the table.</span></div>
            <div className="outcome lose"><strong>Lose</strong><span>Both teams keep their current positions.</span></div>
          </div>
        </div>
      </>
    )
  },
  {
    title: 'Playoff brackets',
    body: (
      <>
        <Head num="06" title="Playoff format" />
        <p className="rule-text">After round robin, the qualifying teams enter a knockout bracket. Each playoff encounter is best of five; the first team to win three matches advances.</p>
        <div className="rule-grid two">
          <div className="rule-box">
            <span className="rule-label">If the top 4 qualify</span>
            <div className="bracket">
              <Match title="Semifinal 1" seeds={[['1', '1st place'], ['3', '3rd place']]} />
              <Match title="Semifinal 2" seeds={[['2', '2nd place'], ['4', '4th place']]} />
              <Match title="Final" final seeds={[['', 'Winner SF1'], ['', 'Winner SF2']]} />
            </div>
          </div>
          <div className="rule-box">
            <span className="rule-label">If the top 3 qualify</span>
            <div className="bracket">
              <Match title="Eliminator" seeds={[['2', '2nd place'], ['3', '3rd place']]} />
              <Match title="Final" final seeds={[['1', '1st place'], ['', 'Winner Eliminator']]} />
            </div>
          </div>
          <div className="rule-box playoff-direct"><span className="rule-label">If the top 2 qualify</span><p className="rule-text">1st place meets 2nd place directly in the final.</p></div>
        </div>
      </>
    )
  },
  {
    title: 'Best of 5',
    body: (
      <>
        <Head num="06" title="Every playoff encounter · best of 5" />
        <p className="rule-text">Teams share their <strong>lineups upfront</strong>, before the encounter starts. Play all five courts in the order below; every court needs a completed score. The Doubles 3 court is a single 10-point tiebreak.</p>
        <ol className="rubbers">
          <li><Icon name="users" /><strong>Doubles 1</strong><span>Match 1</span><span className="chip on">P1 + P2</span></li>
          <li><Icon name="user" /><strong>Singles 1</strong><span>Match 2</span><span className="chip on">P3</span></li>
          <li><Icon name="users" /><strong>Doubles 2</strong><span>Match 3 · P3 + P1 or P2</span><span className="chip on">P1 + P3</span></li>
          <li><Icon name="user" /><strong>Singles 2</strong><span>Match 4 · player left out</span><span className="chip on">P2</span></li>
          <li className="decider"><Icon name="bolt" /><strong>Doubles 3</strong><span>Match 5 · one 10-point tiebreak · both singles players</span><span className="chip">P3 + P2</span></li>
        </ol>
        <div className="rule-box first-to">
          <strong className="rule-big">First to 3</strong>
          <Seats filled={3} total={5} />
          <p className="rule-text">The team that wins 3 of the 5 courts advances to the next round.</p>
        </div>
      </>
    )
  }
];
}
