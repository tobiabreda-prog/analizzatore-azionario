import { approvedReportModels, listGeminiModels } from "./gemini-models.js";
import { REPORT_RESPONSE_SCHEMA, validateReportCommentary } from "../ai/report-commentary.js";

export async function requestReportCommentary({ apiKey, systemInstruction, userPrompt, verifiedFacts, fetchImpl = fetch, listModels = listGeminiModels }) {
  if (!apiKey) throw new Error("Chiave Gemini mancante: inseriscila nelle impostazioni.");
  const models = approvedReportModels(await listModels(apiKey));
  if (!models.length) throw new Error("gemini-3.5-flash-lite non disponibile per la chiave. Nessun passaggio automatico a modelli alternativi.");
  const payload = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { responseMimeType: "application/json", responseSchema: REPORT_RESPONSE_SCHEMA, temperature: 0.3, maxOutputTokens: 3072 }
  };
  let lastError = "Nessun modello compatibile.";
  for (const model of models) {
    let response;
    try {
      response = await fetchImpl("https://generativelanguage.googleapis.com/v1beta/" + model.name + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(payload)
      });
    } catch (error) { throw new Error("Rete Gemini non raggiungibile: " + String(error.message || error)); }
    if (response.status === 429) throw new Error("Quota Gemini esaurita (429): il report numerico rimane disponibile; riprova più tardi.");
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      lastError = model.name + ": HTTP " + response.status + " " + String(detail.error?.message || "").slice(0, 160);
      if (response.status === 400 || response.status === 404) continue;
      throw new Error(lastError);
    }
    const answer = await response.json();
    const content = answer.candidates?.[0]?.content?.parts;
    if (!Array.isArray(content)) throw new Error("Risposta Gemini vuota");
    const raw = content.map(part => typeof part.text === "string" ? part.text : "").join("").trim();
    let parsed;
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
    catch { throw new Error("JSON Gemini non interpretabile: report numerico non modificato."); }
    return validateReportCommentary(parsed, verifiedFacts);
  }
  throw new Error("Nessun modello Gemini utilizzabile: " + lastError);
}
