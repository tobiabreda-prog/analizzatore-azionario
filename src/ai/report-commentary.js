export const COMMENTARY_VERSION = 2;

export const REPORT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: ["horizon", "motivation", "strengths", "risks"],
  properties: {
    horizon: { type: "STRING" },
    motivation: { type: "STRING" },
    strengths: { type: "ARRAY", items: { type: "STRING" } },
    risks: { type: "ARRAY", items: { type: "STRING" } },
    news: {
      type: "OBJECT", required: ["tone", "risks", "items"],
      properties: {
        tone: { type: "STRING" },
        risks: { type: "ARRAY", items: { type: "STRING" } },
        items: { type: "ARRAY", items: {
          type: "OBJECT", required: ["i", "t", "s"],
          properties: { i: { type: "INTEGER" }, t: { type: "STRING" }, s: { type: "STRING", enum: ["pos", "neu", "neg"] } }
        } }
      }
    }
  }
};

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function text(value, maxLength = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error("Risposta AI fuori schema: testo non valido");
  return value.trim();
}
function texts(value, maxItems = 10) {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error("Risposta AI fuori schema: elenco non valido");
  return value.map(item => text(item, 1000));
}

// Recognize both Italian and ungrouped decimal notation. Exact numeric values,
// not substring matches (20 must never authorize 120), are compared below.
function numericTokens(value) {
  const source = String(value).replace(/(?<!\d)([+\-−]?\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?)(?!\d)/g, grouped => grouped.replace(/[ \u00a0\u202f]/g, ""));
  return Array.from(source.matchAll(/[+\-−]?\d+(?:[.,]\d+)*(?:[eE][+\-]?\d+)?/g), match =>
    match[0].startsWith("-") && /\d/.test(source[match.index - 1] || "") ? match[0].slice(1) : match[0]
  );
}
function numericValue(token) {
  let value = token.replace("−", "-");
  if (/[eE]/.test(value)) return Number(value.replace(",", "."));
  if (value.includes(",") && value.includes(".")) {
    value = value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  } else if (value.includes(",")) {
    value = value.replace(",", ".");
  } else if (/^[+\-]?\d{1,3}(?:\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  return Number(value);
}
function factNumbers(facts, found = new Set()) {
  if (typeof facts === "number" && Number.isFinite(facts)) found.add(facts);
  else if (typeof facts === "string") numericTokens(facts).forEach(token => found.add(numericValue(token)));
  else if (Array.isArray(facts)) facts.forEach(value => factNumbers(value, found));
  else if (object(facts)) Object.values(facts).forEach(value => factNumbers(value, found));
  return found;
}
function verifyNumbers(claim, numbers) {
  // Method names and the fixed reporting window are not numeric data claims.
  // They authorize only these expressions, never bare 50/200/6/12 values.
  const dataClaims = claim.replace(/\bSMA\s*(?:50|200)\b|\bRSI\s*\(\s*14\s*\)|\b6\s*[-–]\s*12\s+mesi\b/gi, "");
  for (const token of numericTokens(dataClaims)) {
    const value = numericValue(token);
    if (!Number.isFinite(value) || !numbers.has(value)) throw new Error("AI ha introdotto un numero non presente nei dati verificati: " + token);
  }
}

/** Lexical/schema validation, not a certification of the narrative's meaning. */
export function validateReportCommentary(result, verifiedFacts) {
  if (!object(result)) throw new Error("Risposta AI fuori schema");
  const clean = {
    horizon: text(result.horizon, 100),
    motivation: text(result.motivation),
    strengths: texts(result.strengths),
    risks: texts(result.risks)
  };
  const numbers = factNumbers(verifiedFacts);
  // This horizon is a conventional reporting window, not a forecast from data.
  if (!/^6\s*[-–]\s*12 mesi$/.test(clean.horizon)) verifyNumbers(clean.horizon, numbers);
  [clean.motivation, ...clean.strengths, ...clean.risks].forEach(claim => verifyNumbers(claim, numbers));
  if (result.news !== undefined) {
    if (!object(result.news) || !Array.isArray(result.news.items)) throw new Error("Risposta AI fuori schema: notizie non valide");
    const sourceNews = verifiedFacts?.notizie || [];
    const seen = new Set();
    const news = { tone: text(result.news.tone, 1500), risks: texts(result.news.risks, 3), items: [] };
    for (const item of result.news.items) {
      if (!object(item) || !Number.isInteger(item.i) || item.i < 0 || item.i >= sourceNews.length || seen.has(item.i) || !["pos", "neu", "neg"].includes(item.s)) throw new Error("Risposta AI fuori schema: riferimento notizia non valido");
      seen.add(item.i);
      const title = text(item.t, 1000);
      verifyNumbers(title, factNumbers(sourceNews[item.i]));
      news.items.push({ i: item.i, t: title, s: item.s });
    }
    [news.tone, ...news.risks].forEach(claim => verifyNumbers(claim, numbers));
    clean.news = news;
  }
  // Unknown properties, including entry/stop/target, never reach React/cache.
  return clean;
}
