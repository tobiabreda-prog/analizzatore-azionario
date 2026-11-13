import { describe, expect, it } from "vitest";
import { assessDataPoint, requireUsable } from "./data-quality.js";
import { normalizeInstrument, normalizeObservation } from "./market-data-contract.js";

describe("data quality", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  it("flags stale prices", () => { expect(assessDataPoint({ value: 10, kind: "price", currency: "EUR", source: "test", asOf: "2026-11-01" }, now).issues).toContain("Dato obsoleto"); });
  it("blocks a missing source", () => { expect(() => requireUsable({ value: 10, kind: "price", currency: "EUR", asOf: "2026-11-13" }, { now })).toThrow(); });
  it("normalizes an instrument and requires currency", () => { expect(normalizeInstrument({ ticker: "eni.mi", name: "Eni", currency: "eur" }).ticker).toBe("ENI.MI"); expect(() => normalizeInstrument({ ticker: "ABC", name: "ABC" })).toThrow(); });
  it("normalizes source-dated observations", () => { expect(normalizeObservation({ value: "3.2", date: "2026-01-01", source: "SEC" }).value).toBe(3.2); expect(() => normalizeObservation({ value: "n.d.", date: "2026-01-01", source: "SEC" })).toThrow(); });
});
