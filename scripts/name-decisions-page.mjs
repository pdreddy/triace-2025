// One self-contained HTML page for settling the names the migration could not. No server and no network:
// pick or type a full name per row, then copy or download the decisions and hand the file back to the migration.
const esc = s => JSON.stringify(s).replace(/</g, '\\u003c').replace(new RegExp('[\\u2028\\u2029]', 'g'), '');

export function renderDecisionPage({ rows, players }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fix player names</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#dfe3e8;--ink:#1c2430;--muted:#6b7684;--accent:#0b6e4f;--warn:#b45309}
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
header{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
h1{font-size:18px;margin:0 8px 0 0}.bar{flex:1 1 160px;min-width:120px;height:8px;background:var(--line);border-radius:4px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent);width:0}
button,input,select{font:inherit}button{border:1px solid var(--line);background:var(--card);padding:6px 12px;border-radius:8px;cursor:pointer}button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
main{max-width:900px;margin:0 auto;padding:16px}details.team{margin:0 0 14px}summary{cursor:pointer;font-weight:700;padding:6px 0}
.row{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:8px 0}.row.done{border-color:var(--accent)}
.top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.name{font-size:18px;font-weight:700}.tag{font-size:12px;padding:1px 8px;border-radius:99px;background:#eef1f4;color:var(--muted)}.tag.new{background:#fff3e0;color:var(--warn)}
.ex{font-size:13px;color:var(--muted);margin:4px 0}.cands{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.cands button.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.entry{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.entry input[type=text]{flex:1 1 220px;padding:7px 10px;border:1px solid var(--line);border-radius:8px}label.every{font-size:13px;color:var(--muted)}
.tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-left:auto}.hint{color:var(--muted);font-size:13px;margin:0 0 12px}
</style></head><body>
<header><h1>Fix player names</h1><span id="count"></span><div class="bar"><i id="fill"></i></div>
<div class="tools"><label><input type="checkbox" id="undecided"> only undecided</label><input type="search" id="q" placeholder="Search name or team" style="padding:6px 10px;border:1px solid var(--line);border-radius:8px">
<button id="copy" class="primary">Copy decisions</button><button id="download">Download CSV</button></div></header>
<main><p class="hint">For each name, click the right person or type a full name (suggestions come from the player list; a name that is not on the list creates a new person).
Tick “every team” when that name always means the same person. Your answers are saved in this browser as you go. When finished, press <b>Copy decisions</b> and paste them back to Claude, or download the CSV.</p>
<div id="list"></div></main>
<datalist id="people"></datalist>
<script>
const ROWS = ${esc(rows)}, PLAYERS = ${esc(players)};
const KEY = 'name-decisions:' + ROWS.length + ':' + ROWS.slice(0, 5).map(r => r.raw + r.team).join('|');
const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
const known = new Set(PLAYERS.map(n => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()));
const $ = id => document.getElementById(id);
document.getElementById('people').innerHTML = PLAYERS.map(n => '<option value="' + n.replace(/"/g, '&quot;') + '">').join('');
const state = id => (saved[id] ||= { decision: '', every: false });
const fmt = ts => ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function render() {
  const q = $('q').value.toLowerCase(), only = $('undecided').checked, teams = new Map();
  ROWS.forEach((r, i) => { const s = state(i); if (only && s.decision) return; if (q && !(r.raw + ' ' + r.team).toLowerCase().includes(q)) return; (teams.get(r.team) || teams.set(r.team, []).get(r.team)).push(i); });
  $('list').innerHTML = '';
  for (const [team, ids] of teams) {
    const d = document.createElement('details'); d.className = 'team'; d.open = true;
    d.innerHTML = '<summary>' + team + ' <span class="tag">' + ids.length + '</span></summary>';
    ids.forEach(i => d.appendChild(card(i)));
    $('list').appendChild(d);
  }
  const done = ROWS.filter((_, i) => state(i).decision).length;
  $('count').textContent = done + ' of ' + ROWS.length + ' decided'; $('fill').style.width = (ROWS.length ? done / ROWS.length * 100 : 0) + '%';
  localStorage.setItem(KEY, JSON.stringify(saved));
}
function card(i) {
  const r = ROWS[i], s = state(i), el = document.createElement('div'); el.className = 'row' + (s.decision ? ' done' : '');
  const isNew = s.decision && !known.has(s.decision.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const ex = (r.examples || []).map(e => '<div class="ex">' + [fmt(e.ts), e.season, e.court, e.with.length ? 'with ' + e.with.join(' + ') : '', e.against.length ? 'against ' + e.against.join(' + ') : '', e.vs ? '(' + e.vs + ')' : ''].filter(Boolean).join(' · ') + '</div>').join('');
  el.innerHTML = '<div class="top"><span class="name"></span><span class="tag">' + r.count + (r.count === 1 ? ' match' : ' matches') + '</span><span class="tag">' + r.kind + '</span>' + (isNew ? '<span class="tag new">new person</span>' : '') + '</div>' + ex +
    (r.kind === 'unknown' && r.candidates.length ? '<div class="ex">Closest KOC season 3 names:</div>' : '') + '<div class="cands"></div><div class="entry"><input type="text" list="people" placeholder="Full name" value=""><label class="every"><input type="checkbox"> every team</label><button class="clear">Clear</button></div>';
  el.querySelector('.name').textContent = r.raw;
  const cands = el.querySelector('.cands');
  r.candidates.forEach(c => { const b = document.createElement('button'); b.textContent = c; if (c === s.decision) b.className = 'on'; b.onclick = () => { s.decision = c; render(); }; cands.appendChild(b); });
  const input = el.querySelector('input[type=text]'); input.value = s.decision;
  input.onchange = () => { s.decision = input.value.trim(); render(); };
  const every = el.querySelector('label input'); every.checked = s.every; every.onchange = () => { s.every = every.checked; render(); };
  el.querySelector('.clear').onclick = () => { s.decision = ''; render(); };
  return el;
}
const cell = c => /[",\\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c);
function csv() { return ['raw,team,matches,kind,candidates,decision'].concat(ROWS.map((r, i) => { const s = state(i); return [r.raw, s.every ? '' : r.team, r.count, r.kind, r.candidates.join(' | '), s.decision].map(cell).join(','); })).join('\\n') + '\\n'; }
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(csv()); $('copy').textContent = 'Copied'; } catch { prompt('Copy this text', csv()); } setTimeout(() => $('copy').textContent = 'Copy decisions', 1500); };
$('download').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv' })); a.download = 'name-decisions-filled.csv'; a.click(); };
$('q').oninput = render; $('undecided').onchange = render; render();
</script></body></html>`;
}
