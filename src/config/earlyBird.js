// Early-bird registration. Defaults: open from 6 Nov 2026, early-bird price until 13 Nov,
// and from 14 Nov registration costs $10 more. Override at build time with
// VITE_EARLY_BIRD_OPENS / VITE_EARLY_BIRD_ENDS (YYYY-MM-DD) and VITE_LATE_SURCHARGE_USD.
const env = import.meta.env || {};
export const EARLY_BIRD = {
  opens: env.VITE_EARLY_BIRD_OPENS || '2026-11-06',
  ends: env.VITE_EARLY_BIRD_ENDS || '2026-11-13',
  surchargeUsd: Number(env.VITE_LATE_SURCHARGE_USD || 10)
};

const DAY = 86400000;
const parse = day => Date.parse(`${day}T00:00:00Z`);
export const nextDay = day => new Date(parse(day) + DAY).toISOString().slice(0, 10);
export const longDate = day => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
// Today as a calendar day in the viewer's own time zone.
export const localDay = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function earlyBirdStatus(plan = EARLY_BIRD, today = localDay()) {
  const late = nextDay(plan.ends), money = `$${plan.surchargeUsd}`;
  if (today < plan.opens) return { phase: 'upcoming', label: 'Early bird opens', short: `Opens ${longDate(plan.opens)} · until ${longDate(plan.ends)} · +${money} from ${longDate(late)}`, headline: `Early-bird registration opens ${longDate(plan.opens)}`, detail: `Register ${longDate(plan.opens)}–${longDate(plan.ends)} for the early-bird price. From ${longDate(late)}, registration costs ${money} more.` };
  if (today <= plan.ends) return { phase: 'open', label: 'Early bird open', short: `Until ${longDate(plan.ends)} · +${money} from ${longDate(late)}`, headline: `Early-bird registration is open until ${longDate(plan.ends)}`, detail: `Register by ${longDate(plan.ends)} for the early-bird price. From ${longDate(late)}, registration costs ${money} more.` };
  return { phase: 'late', label: 'Early bird ended', short: `Ended ${longDate(plan.ends)} · registration now costs ${money} more`, headline: `Early-bird registration ended ${longDate(plan.ends)}`, detail: `Registration now costs ${money} more than the early-bird price.` };
}
