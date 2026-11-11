// The season calendar: every date the admin controls in one place. Dates are calendar days (YYYY-MM-DD).
// Shared by the Cloud Functions and the browser, so it stays free of Node-only imports.
export const DEFAULT_CALENDAR = { registrationOpens: '', registrationCloses: '', seasonStart: '', roundDays: 7, buffers: [], playoffGapWeeks: 1 };
const DATE = /^\d{4}-\d{2}-\d{2}$/, DAY = 86400000;
export const MAX_BUFFERS = 20;
const fail = message => { const error = new Error(message); error.name = 'ValidationError'; throw error; };
export const isDay = value => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

// Buffer weeks: "after round 3, leave 1 week free". Text form "3:1, 6:2" is what the admin types.
export function parseBuffers(text) {
  if (Array.isArray(text)) return text;
  const items = String(text ?? '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  return items.map(item => { const m = item.match(/^(\d{1,2})\s*[:x@-]\s*(\d{1,2})$/); if (!m) fail(`“${item}” is not a buffer. Write it as round:weeks, for example 3:1.`); return { afterRound: Number(m[1]), weeks: Number(m[2]) }; });
}
export const bufferText = buffers => (buffers || []).map(b => `${b.afterRound}:${b.weeks}`).join(', ');
export function validateBuffers(value) {
  const list = parseBuffers(value);
  if (list.length > MAX_BUFFERS) fail(`At most ${MAX_BUFFERS} buffer entries.`);
  const merged = new Map();
  for (const b of list) {
    if (!b || !Number.isInteger(b.afterRound) || b.afterRound < 1 || b.afterRound > 60) fail('A buffer must come after a round from 1 to 60.');
    if (!Number.isInteger(b.weeks) || b.weeks < 1 || b.weeks > 12) fail('A buffer lasts 1 to 12 weeks.');
    merged.set(b.afterRound, (merged.get(b.afterRound) || 0) + b.weeks);
  }
  return [...merged].sort((a, b) => a[0] - b[0]).map(([afterRound, weeks]) => ({ afterRound, weeks }));
}
export function validateCalendar(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid calendar.');
  const allowed = Object.keys(DEFAULT_CALENDAR);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Invalid calendar fields.');
  const day = (key, label) => { const v = value[key] ?? ''; if (v !== '' && !isDay(v)) fail(`${label} must be a date.`); return v; };
  const calendar = {
    registrationOpens: day('registrationOpens', 'Registration opens'), registrationCloses: day('registrationCloses', 'Registration closes'),
    seasonStart: day('seasonStart', 'Season start'), roundDays: Number(value.roundDays ?? 7), buffers: validateBuffers(value.buffers ?? []), playoffGapWeeks: Number(value.playoffGapWeeks ?? 1)
  };
  if (calendar.registrationOpens && calendar.registrationCloses && calendar.registrationCloses < calendar.registrationOpens) fail('Registration cannot close before it opens.');
  if (calendar.registrationCloses && calendar.seasonStart && calendar.seasonStart <= calendar.registrationCloses) fail('The season should start after registration closes.');
  if (!Number.isInteger(calendar.roundDays) || calendar.roundDays < 1 || calendar.roundDays > 60) fail('Days per round must be 1–60.');
  if (!Number.isInteger(calendar.playoffGapWeeks) || calendar.playoffGapWeeks < 0 || calendar.playoffGapWeeks > 12) fail('The playoff gap must be 0–12 weeks.');
  return calendar;
}
export const calendarOf = state => ({ ...DEFAULT_CALENDAR, ...(state?.calendar || {}) });

// Start date of a round: every round takes `intervalDays`, and each buffer pushes later rounds back by its weeks.
export function roundStart(start, intervalDays, buffers, round) {
  const weeks = (buffers || []).filter(b => b.afterRound < round).reduce((n, b) => n + b.weeks, 0);
  return addDays(start, (round - 1) * intervalDays + weeks * 7);
}
// The registration window as a person sees it. The manual on/off switch still wins: switched off means closed.
// Opening counts from the earliest time zone, and closing lasts until the end of that day in the last one (UTC−12), as match deadlines do.
export function registrationWindow(settings, calendar, now = Date.now()) {
  if (settings && settings.registrationEnabled === false) return { open: false, reason: 'Registration is closed.' };
  const c = { ...DEFAULT_CALENDAR, ...(calendar || {}) };
  if (c.registrationOpens && now < Date.parse(`${c.registrationOpens}T00:00:00Z`) - 14 * 3600000) return { open: false, reason: `Registration opens on ${c.registrationOpens}.` };
  if (c.registrationCloses && now > Date.parse(`${c.registrationCloses}T23:59:59Z`) + 12 * 3600000) return { open: false, reason: `Registration closed on ${c.registrationCloses}.` };
  return { open: true, reason: '' };
}
