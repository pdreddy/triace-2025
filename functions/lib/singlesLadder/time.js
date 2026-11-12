// Deadlines in the season timezone. Everything is stored as UTC milliseconds; the timezone only decides which instant
// "Sunday 23:59" is, including across daylight-saving changes.
const formatters = new Map();
function parts(ts, timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) formatters.set(timeZone, fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  const p = Object.fromEntries(fmt.formatToParts(ts).map(x => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second };
}
// The local calendar date and weekday (0 = Sunday) of an instant.
export function localDate(ts, timeZone) {
  const p = parts(ts, timeZone);
  return { ...p, weekday: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}
// The UTC instant of a local wall-clock minute. A time skipped by the spring change resolves to the first real minute
// after it; a time repeated by the autumn change resolves to its LAST occurrence, so a deadline is never cut short.
export function zonedTime(year, month, day, hour, minute, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const asWall = ts => { const p = parts(ts, timeZone); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute); };
  const candidates = new Set();
  for (const probe of [wall - 86400000, wall + 86400000]) { const guess = wall - (asWall(probe) - probe); if (asWall(guess) === wall) candidates.add(guess); }
  if (candidates.size) return Math.max(...candidates);
  let ts = wall - 86400000; while (asWall(ts) < wall) ts += 60000;   // skipped local time
  return ts;
}
// The first deadline (weekday + HH:MM, to the end of that minute) that is at least `minDays` after `from`.
export function nextDeadline(from, { day, time, timezone, minDays = 0 }) {
  const [hour, minute] = time.split(':').map(Number), earliest = from + minDays * 86400000;
  const start = localDate(from, timezone);
  for (let offset = 0; offset <= 28; offset++) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    if (date.getUTCDay() !== day) continue;
    const end = zonedTime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute, timezone) + 59999;
    if (end >= earliest) return end;
  }
  throw new Error('Could not calculate the match deadline.');
}
export const formatInZone = (ts, timeZone) => ts ? new Date(ts).toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—';
