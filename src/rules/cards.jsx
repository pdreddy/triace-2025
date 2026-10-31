import { Icon } from '../components/Icons';
import { UtrMeter } from '../components/UI';

// The official Triace 2.0 rules, one flash card per entry. Ratings are in hundredths of a UTR.
const RULE_TIERS = [
  { id: 'rising', name: 'Rising', minCombinedUtr: 1150, maxCombinedUtr: 1750 },
  { id: 'goat', name: 'GOAT', minCombinedUtr: 1750, maxCombinedUtr: 2200 }
];

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

export const RULE_CARDS = [
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
          <div><b>2</b><span>tiers: GOAT &amp; Rising</span></div>
          <div><b>40%</b><span>singles days per player</span></div>
          <div><b>Bo5</b><span>playoff encounters</span></div>
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
          <p className="rule-text">If singles and doubles are more than <strong>1.75 apart</strong>, the <strong>average</strong> of the two counts instead. Example: singles 5.00 and doubles 7.00 → 6.00.</p>
        </div>
      </>
    )
  },
  {
    title: 'UTR & tiers',
    body: (
      <>
        <Head num="02" title="Team UTR & tiers" />
        <p className="rule-text">Combined team UTR = P1 + P2 + P3, each counted by the rating rule on the previous card. Both ends of each range count; a team at exactly 17.50 qualifies for GOAT.</p>
        <UtrMeter tiers={RULE_TIERS} />
        <div className="rule-box">
          <span className="rule-label">How teams are placed</span>
          <ul className="ticks">
            <li>When registering, a team can state a tier preference or choose <strong>“Interested in a higher UTR tier.”</strong></li>
            <li>A team is placed in the <strong>highest active tier</strong> whose range includes its combined UTR, even if it preferred a lower tier.</li>
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
        <p className="rule-text">Every round-robin encounter is <strong>three matches: two doubles, then one singles</strong>, played in this order.</p>
        <ol className="rule-steps three">
          <li><strong>Doubles 1</strong><span>Any two players pair up.</span><span className="chips"><span className="chip on">P1 + P2</span></span></li>
          <li><strong>Doubles 2</strong><span>The third player pairs with one of the Doubles 1 players. The Doubles 1 pair can’t play together again.</span><span className="chips"><span className="chip on">P1 + P3</span><span className="chip on">P2 + P3</span><span className="chip off">P1 + P2</span></span></li>
          <li><strong>Singles</strong><span>The player who sat out Doubles 2 plays the singles.</span><span className="chips"><span className="chip on">P2</span></span></li>
        </ol>
        <p className="rule-text">Example: P1 + P2 play Doubles 1, P1 + P3 play Doubles 2, and P2 plays the singles. Every player plays exactly two matches.</p>
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
            <Ring percent={40} label="singles days" />
            <p className="rule-text">Every player must play <strong>singles</strong> on at least 40% of the team’s scheduled match days, <strong>rounded down</strong>.</p>
            <div className="calc"><span><b>8</b>match days</span><Icon name="arrow" size={16} /><span><b>3.2</b>40%</span><Icon name="arrow" size={16} /><span className="win"><b>3</b>singles days</span></div>
          </div>
          <div className="rule-box">
            <span className="rule-label">Minimum singles days, per player</span>
            <table className="rule-table">
              <thead><tr><th scope="col">Match days</th><th scope="col">Singles needed</th></tr></thead>
              <tbody>
                <tr><td>5 – 7</td><td>2</td></tr>
                <tr className="hl"><td>8 (example)</td><td>3</td></tr>
                <tr><td>9</td><td>3</td></tr>
                <tr><td>10 – 12</td><td>4</td></tr>
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
          <div className="rule-box qualify"><span className="rule-label">More than 7 teams</span><b className="qualify-num">4</b><strong className="rule-big">Top 4 qualify</strong><Seats filled={4} total={8} /></div>
          <div className="rule-box qualify"><span className="rule-label">7 or fewer teams</span><b className="qualify-num">3</b><strong className="rule-big">Top 3 qualify</strong><Seats filled={3} total={7} /></div>
        </div>
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
        </div>
      </>
    )
  },
  {
    title: 'Best of 5',
    body: (
      <>
        <Head num="06" title="Every playoff encounter · best of 5" />
        <ol className="rubbers">
          <li><Icon name="users" /><strong>Doubles 1</strong><span>Match 1</span></li>
          <li><Icon name="user" /><strong>Singles</strong><span>Match 2</span></li>
          <li><Icon name="users" /><strong>Doubles 2</strong><span>Match 3</span></li>
          <li><Icon name="user" /><strong>Singles</strong><span>Match 4</span></li>
          <li className="decider"><Icon name="bolt" /><strong>Super tiebreak</strong><span>Match 5 · 10 points</span></li>
        </ol>
        <div className="rule-box first-to">
          <strong className="rule-big">First to 3</strong>
          <Seats filled={3} total={5} />
          <p className="rule-text">The first team to win 3 of the 5 matches advances to the next round.</p>
        </div>
      </>
    )
  }
];
