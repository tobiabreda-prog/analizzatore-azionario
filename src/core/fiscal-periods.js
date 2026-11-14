const DAY_MS = 86_400_000;
export const FINANCIALS_SCHEMA_VERSION = 2;

function periodTime(row) {
  const date = row?.periodEnd;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : null;
}

function usesLegacyYears(start, end) {
  return start?.periodEnd == null && end?.periodEnd == null &&
    Number.isInteger(start?.y) && Number.isInteger(end?.y);
}

/** Sort exact fiscal ends chronologically, retaining compatibility with cached year-only rows. */
export function compareAnnualPeriods(a, b) {
  const first = periodTime(a), last = periodTime(b);
  if (first != null && last != null) return first - last;
  return (Number.isInteger(a?.y) ? a.y : 0) - (Number.isInteger(b?.y) ? b.y : 0);
}

/** Actual elapsed years for CAGR; incomplete period metadata must not imply an annual duration. */
export function annualPeriodYears(start, end) {
  if (usesLegacyYears(start, end)) return end.y > start.y ? end.y - start.y : null;
  const first = periodTime(start), last = periodTime(end);
  return first != null && last != null && last > first ? (last - first) / (365.25 * DAY_MS) : null;
}

/** Allow normal 52/53-week fiscal years, but reject short transition periods and missing years. */
export function isComparableAnnualPeriod(previous, current) {
  if (usesLegacyYears(previous, current)) return current.y === previous.y + 1;
  const first = periodTime(previous), last = periodTime(current);
  if (first == null || last == null) return false;
  const days = (last - first) / DAY_MS;
  return days >= 350 && days <= 380;
}
