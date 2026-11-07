import { useEffect, useState } from 'react';
import { Field, Message } from './UI';
import { DEFAULT_CALENDAR, validateCalendar, bufferText, roundStart, addDays } from '../config/calendar.js';

const form = calendar => ({ ...calendar, buffers: bufferText(calendar.buffers), roundDays: String(calendar.roundDays), playoffGapWeeks: String(calendar.playoffGapWeeks) });
const longDay = day => day ? new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

// Admin → Dates: every date in one place. The season calendar drives "Auto-schedule" (fixtures + dated rounds for every tier, buffer weeks included).
export default function AdminCalendar({ service, saved, tiers, disabled }) {
  const calendar = { ...DEFAULT_CALENDAR, ...(saved || {}) };
  const [draft, setDraft] = useState(form(calendar)), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [outcome, setOutcome] = useState(null), [extra, setExtra] = useState({ afterRound: '', weeks: '1' });
  useEffect(() => { if (!dirty) setDraft(form(calendar)); }, [saved, dirty]);   // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (key, value) => { setDraft(old => ({ ...old, [key]: value })); setDirty(true); setMessage(''); setError(''); };
  let valid = null, problem = '';
  try { valid = validateCalendar({ ...draft, roundDays: Number(draft.roundDays), playoffGapWeeks: Number(draft.playoffGapWeeks) }); } catch (e) { problem = e.message; }
  const maxTeams = Math.max(0, ...tiers.map(t => t.teams));
  const rounds = maxTeams >= 2 ? maxTeams - 1 + (maxTeams % 2) : 5;
  const preview = valid?.seasonStart ? Array.from({ length: rounds }, (_, i) => roundStart(valid.seasonStart, valid.roundDays, valid.buffers, i + 1)) : [];
  const playoffs = preview.length ? addDays(roundStart(valid.seasonStart, valid.roundDays, valid.buffers, rounds), valid.roundDays + valid.playoffGapWeeks * 7) : '';

  async function run(work, done) {
    setBusy(true); setError(''); setMessage('');
    try { const result = await work(); setMessage(done(result)); return result; } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const save = () => run(async () => { await service.saveCalendar(valid); setDirty(false); }, () => 'Calendar saved. Registration follows these dates from now on.');
  const auto = async () => {
    if (!window.confirm('Create fixtures for every tier that has none and date every round from this calendar? Results that are already in are never deleted.')) return;
    const result = await run(() => service.autoSchedule({}), r => `Scheduled ${r.tiers.filter(t => !t.skipped).length} tier(s).`);
    if (result) setOutcome(result.tiers);
  };
  const addBuffer = () => run(async () => { const result = await service.addBufferWeeks({ afterRound: Number(extra.afterRound), weeks: Number(extra.weeks) }); setExtra({ afterRound: '', weeks: '1' }); return result; }, r => `Added a ${r.buffer.weeks}-week buffer after round ${r.buffer.afterRound}. Every later round moved.`);

  return (
    <section className="card calendar-admin pane pane-calendar" aria-labelledby="calendar-title">
      <h3 id="calendar-title">Season calendar</h3>
      <p className="small">Every date lives here (early bird is in Settings). Leave a date empty to switch that limit off. Saved to the database: no rebuild or deploy.</p>
      <div className="ratings">
        <Field id="cal-opens" label="Registration opens" type="date" value={draft.registrationOpens} disabled={disabled} onChange={e => edit('registrationOpens', e.target.value)} />
        <Field id="cal-closes" label="Last registration day" type="date" value={draft.registrationCloses} disabled={disabled} onChange={e => edit('registrationCloses', e.target.value)} hint="Registration closes itself after this day." />
        <Field id="cal-start" label="Season (round 1) starts" type="date" value={draft.seasonStart} disabled={disabled} onChange={e => edit('seasonStart', e.target.value)} />
        <Field id="cal-days" label="Days per round" type="number" min="1" max="60" value={draft.roundDays} disabled={disabled} onChange={e => edit('roundDays', e.target.value)} />
        <Field id="cal-gap" label="Weeks before playoffs" type="number" min="0" max="12" value={draft.playoffGapWeeks} disabled={disabled} onChange={e => edit('playoffGapWeeks', e.target.value)} />
        <Field id="cal-buffers" label="Buffer weeks" value={draft.buffers} disabled={disabled} onChange={e => edit('buffers', e.target.value)} hint="round:weeks, e.g. 3:1, 6:2 = one free week after round 3, two after round 6." />
      </div>
      {preview.length > 0 && <p className="early-preview"><b>Round dates:</b> {preview.map((d, i) => `R${i + 1} ${longDay(d).replace(/, \d{4}$/, '')}`).join(' · ')} · <b>Playoffs from</b> {longDay(playoffs)}</p>}
      <Message error>{problem && dirty ? problem : error}</Message>
      <Message>{message}</Message>
      <div className="card-actions">
        <button type="button" className="button" disabled={disabled || busy || !dirty || !!problem} onClick={save}>{busy ? 'Working…' : 'Save calendar'}</button>
        <button type="button" className="secondary" disabled={disabled || busy || dirty || !calendar.seasonStart} onClick={auto} title={dirty ? 'Save the calendar first' : ''}>Auto-schedule all tiers</button>
      </div>
      {dirty && <p className="small note">Save the calendar before auto-scheduling.</p>}
      <div className="inline-form buffer-form">
        <Field id="buf-after" label="Add buffer after round" type="number" min="1" max="60" value={extra.afterRound} disabled={disabled} onChange={e => setExtra(old => ({ ...old, afterRound: e.target.value }))} />
        <Field id="buf-weeks" label="Weeks" type="number" min="1" max="12" value={extra.weeks} disabled={disabled} onChange={e => setExtra(old => ({ ...old, weeks: e.target.value }))} />
        <button type="button" className="secondary small" disabled={disabled || busy || !extra.afterRound || !calendar.seasonStart} onClick={addBuffer}>Add buffer &amp; shift later rounds</button>
      </div>
      {outcome && <ul className="small auto-result">{outcome.map(t => <li key={t.tierId}><b>{tiers.find(x => x.id === t.tierId)?.name || t.tierId}</b>: {t.skipped || `${t.created ? 'fixtures created' : 'fixtures kept'}, ${t.rounds} rounds from ${t.firstRound}, playoffs from ${t.playoffsStart}`}</li>)}</ul>}
    </section>
  );
}
