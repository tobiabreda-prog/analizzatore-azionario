import { describe, expect, it } from "vitest";
import { annualPeriodYears, compareAnnualPeriods, isComparableAnnualPeriod } from "./fiscal-periods.js";

describe("fiscal-period chronology and growth intervals", () => {
  it("keeps two different fiscal ends in the same calendar year in chronological order", () => {
    const june = { y: 2025, periodEnd: "2025-06-30" };
    const december = { y: 2025, periodEnd: "2025-12-31" };
    expect([december, june].sort(compareAnnualPeriods)).toEqual([june, december]);
    expect(isComparableAnnualPeriod(june, december)).toBe(false);
  });

  it("rejects short fiscal transition periods despite consecutive year labels", () => {
    const start = { y: 2024, periodEnd: "2024-12-31" };
    const end = { y: 2025, periodEnd: "2025-06-30" };
    expect(isComparableAnnualPeriod(start, end)).toBe(false);
    expect(annualPeriodYears(start, end)).toBeCloseTo(181 / 365.25);
  });

  it("allows leap years and 53-week fiscal years while rejecting two-year gaps", () => {
    expect(isComparableAnnualPeriod({ periodEnd: "2023-12-31" }, { periodEnd: "2024-12-31" })).toBe(true);
    expect(isComparableAnnualPeriod({ periodEnd: "2024-12-28" }, { periodEnd: "2026-01-03" })).toBe(true);
    expect(isComparableAnnualPeriod({ periodEnd: "2024-12-31" }, { periodEnd: "2026-12-31" })).toBe(false);
  });

  it("retains year-only cached data without guessing when only one exact date is known", () => {
    expect(annualPeriodYears({ y: 2022 }, { y: 2024 })).toBe(2);
    expect(isComparableAnnualPeriod({ y: 2024 }, { y: 2025 })).toBe(true);
    expect(annualPeriodYears({ y: 2024 }, { y: 2025, periodEnd: "2025-12-31" })).toBeNull();
    expect(isComparableAnnualPeriod({ y: 2024 }, { y: 2025, periodEnd: "2025-12-31" })).toBe(false);
  });

  it("does not turn impossible or reversed dates into annual intervals", () => {
    const good = { y: 2024, periodEnd: "2024-12-31" };
    const bad = { y: 2025, periodEnd: "2025-02-29" };
    expect(annualPeriodYears(good, bad)).toBeNull();
    expect(isComparableAnnualPeriod(good, bad)).toBe(false);
    expect(annualPeriodYears({ periodEnd: "2025-12-31" }, good)).toBeNull();
  });
});
