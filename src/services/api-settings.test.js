import { afterEach, describe, expect, it } from "vitest";
import { getApiKey, getApiSettingsStatus, saveApiKey } from "./api-settings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear()
  };
}

const originalStorage = globalThis.localStorage;
afterEach(() => {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
});

describe("shared API settings", () => {
  it("reads legacy credentials so existing installations do not need to re-enter keys", () => {
    globalThis.localStorage = memoryStorage();
    localStorage.setItem("av_key", "legacy-av");
    expect(getApiKey("alphavantage")).toBe("legacy-av");
  });

  it("saves credentials centrally without duplicating legacy entries", () => {
    globalThis.localStorage = memoryStorage();
    localStorage.setItem("fred_api_key", "old-secret");
    saveApiKey("fred", " fred-secret ");
    expect(getApiKey("fred")).toBe("fred-secret");
    expect(JSON.parse(localStorage.getItem("aa_api_settings_v1")).fred).toBe("fred-secret");
    expect(localStorage.getItem("fred_api_key")).toBe(null);
    expect(getApiSettingsStatus().fred).toBe(true);
  });

  it("removes a credential from both stores when cleared", () => {
    globalThis.localStorage = memoryStorage();
    saveApiKey("gemini", "secret");
    saveApiKey("gemini", "");
    expect(getApiKey("gemini")).toBe("");
    expect(localStorage.getItem("gemini_api_key")).toBe(null);
    expect(getApiSettingsStatus().gemini).toBe(false);
  });

  it("rejects unknown providers", () => {
    globalThis.localStorage = memoryStorage();
    expect(() => saveApiKey("unknown", "secret")).toThrow(/non supportato/);
  });
});
