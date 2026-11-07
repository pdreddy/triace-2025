// Early-bird registration: dates, the late surcharge, and what to show for today's date.
// Browser-safe and pure. The admin edits the plan (Admin → Early-bird registration); DEFAULT_EARLY_BIRD is used until then.
export const DEFAULT_EARLY_BIRD = { enabled: true, opens: '2026-11-06', ends: '2026-11-13', surchargeUsd: 10 };

const DAY = 86400000;
const parse = day => Date.parse(`${day}T00:00:00Z`);
const isDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(parse(value)).toISOString().slice(0, 10) === value;
export const nextDay = day => new Date(parse(day) + DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((parse(to) - parse(from)) / DAY);
export const longDate = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
// Today as a calendar day in the viewer's own time zone.
export const localDay = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function validateEarlyBird(value) {
  const fail = message => { const error = new Error(message); error.name = 'ValidationError'; throw error; };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Send the early-bird settings.');
  const keys = Object.keys(DEFAULT_EARLY_BIRD);
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) fail('Invalid early-bird settings.');
  if (typeof value.enabled !== 'boolean') fail('Early bird must be on or off.');
  if (!isDay(value.opens) || !isDay(value.ends)) fail('Enter the early-bird dates as real calendar days.');
  if (value.opens > value.ends) fail('The early bird cannot end before it opens.');
  if (!Number.isInteger(value.surchargeUsd) || value.surchargeUsd < 0 || value.surchargeUsd > 1000) fail('The late surcharge must be a whole number of dollars from 0 to 1000.');
  return { enabled: value.enabled, opens: value.opens, ends: value.ends, surchargeUsd: value.surchargeUsd };
}

export function earlyBirdStatus(plan = DEFAULT_EARLY_BIRD, today = localDay()) {
  const late = nextDay(plan.ends), money = `$${plan.surchargeUsd}`, surcharge = plan.surchargeUsd > 0;
  const steps = [
    { key: 'opens', date: plan.opens, title: 'Early bird opens', text: longDate(plan.opens) },
    { key: 'ends', date: plan.ends, title: 'Last early-bird day', text: longDate(plan.ends) },
    { key: 'late', date: late, title: surcharge ? `Registration costs ${money} more per team` : 'Standard registration', text: `From ${longDate(late)}` }
  ];
  const lateText = surcharge ? `From ${longDate(late)}, registration costs ${money} more per team.` : '';
  const plus = surcharge ? ` · +${money} per team from ${longDate(late)}` : '';
  if (!plan.enabled) return { phase: 'off', label: '', countdown: '', short: '', headline: '', detail: '', steps, step: -1 };
  if (today < plan.opens) {
    const days = daysBetween(today, plan.opens);
    return { phase: 'upcoming', label: 'Early bird opens', countdown: days === 1 ? 'Opens tomorrow' : `Opens in ${days} days`, short: `Opens ${longDate(plan.opens)} · until ${longDate(plan.ends)}${plus}`, headline: `Early-bird registration opens ${longDate(plan.opens)}`, detail: `Register ${longDate(plan.opens)}–${longDate(plan.ends)} for the early-bird price. ${lateText}`.trim(), steps, step: -1 };
  }
  if (today <= plan.ends) {
    const left = daysBetween(today, plan.ends) + 1;
    return { phase: 'open', label: 'Early bird open', countdown: left === 1 ? 'Last day!' : `${left} days left`, short: `Until ${longDate(plan.ends)}${plus}`, headline: `Early-bird registration is open until ${longDate(plan.ends)}`, detail: `Register by ${longDate(plan.ends)} for the early-bird price. ${lateText}`.trim(), steps, step: left === 1 ? 1 : 0 };
  }
  return { phase: 'late', label: 'Early bird ended', countdown: '', short: `Ended ${longDate(plan.ends)}${surcharge ? ` · registration now costs ${money} more per team` : ''}`, headline: `Early-bird registration ended ${longDate(plan.ends)}`, detail: surcharge ? `Registration now costs ${money} more per team than the early-bird price.` : 'Standard registration applies.', steps, step: 2 };
}
