// Small pure helpers for the PPRC profile: recent form and the rating trend line. `recent` is newest first, as stored.
export const formOf = (recent = [], count = 5) => recent.slice(0, count).map(h => (h.won ? 'W' : 'L'));
// Oldest to newest, so a line drawn from it reads left to right.
export const trendOf = (recent = [], key = 'overall') => [...recent].reverse().map(h => h[key]).filter(Number.isFinite);
// "x,y x,y ..." for an SVG polyline in a width x height box (a flat series is drawn in the middle).
export function sparkPoints(values, width = 160, height = 40, pad = 4) {
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo;
  return values.map((v, i) => `${(pad + (i * (width - 2 * pad)) / (values.length - 1)).toFixed(1)},${(span ? height - pad - ((v - lo) / span) * (height - 2 * pad) : height / 2).toFixed(1)}`).join(' ');
}
