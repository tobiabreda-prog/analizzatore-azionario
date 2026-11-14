import { describe, expect, it, vi } from "vitest";
import { requestReportCommentary } from "./gemini-report.js";
import { APPROVED_GEMINI_REPORT_MODEL } from "./gemini-models.js";

const valid = { horizon: "6-12 mesi", motivation: "Il P/E è 20.", strengths: [], risks: [] };
const setup = (result = valid) => ({
  apiKey: "fake-unit-key", systemInstruction: "Usa i dati", userPrompt: "P/E 20", verifiedFacts: { pe: 20 },
  listModels: vi.fn(async () => [{ name: APPROVED_GEMINI_REPORT_MODEL, supportedGenerationMethods: ["generateContent"] }]),
  fetchImpl: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }) }))
});

describe("validated Gemini report request", () => {
  it("requests a response schema and returns validated display data", async () => {
    const args = setup();
    expect(await requestReportCommentary(args)).toEqual(valid);
    const [url, options] = args.fetchImpl.mock.calls[0];
    expect(url).toContain(APPROVED_GEMINI_REPORT_MODEL + ":generateContent");
    expect(options.headers["x-goog-api-key"]).toBe("fake-unit-key");
    expect(JSON.parse(options.body).generationConfig.responseSchema.required).toContain("strengths");
  });
  it.each([{ ...valid, strengths: "bad" }, { ...valid, motivation: "P/E 999" }])("rejects valid JSON with invalid structure or unsupported claims", async result => {
    await expect(requestReportCommentary(setup(result))).rejects.toThrow(/schema|numero/);
  });
  it("rejects malformed JSON", async () => {
    const args = setup();
    args.fetchImpl.mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) });
    await expect(requestReportCommentary(args)).rejects.toThrow(/JSON Gemini/);
  });
  it("preserves quota failure and never switches to an unapproved model", async () => {
    const args = setup();
    args.fetchImpl.mockResolvedValue({ ok: false, status: 429 });
    await expect(requestReportCommentary(args)).rejects.toThrow(/429/);
    expect(args.fetchImpl).toHaveBeenCalledTimes(1);
    args.listModels.mockResolvedValue([{ name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] }]);
    await expect(requestReportCommentary(args)).rejects.toThrow(/non disponibile/);
    expect(args.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
