const forbiddenNumericClaims=/\b(?:€|\$|£)\s?\d|\b\d+(?:[.,]\d+)?\s?%/;
export function validateAiInterpretation(result, verifiedFacts) {
  if(!result||typeof result!=="object"||typeof result.summary!=="string"||!Array.isArray(result.risks)||!Array.isArray(result.catalysts)||!Array.isArray(result.missingData)) throw new Error("Risposta AI fuori schema");
  const factsText=JSON.stringify(verifiedFacts);
  const claims=[result.summary,...result.risks,...result.catalysts].filter(x=>typeof x==="string"&&forbiddenNumericClaims.test(x));
  // Numeric claims are permitted only when the exact numeric token is present in the verified input.
  for(const claim of claims){const tokens=claim.match(/(?:€|\$|£)\s?\d[\d.,]*|\b\d+(?:[.,]\d+)?\s?%/g)||[];for(const token of tokens)if(!factsText.includes(token.replace(/\s/g,"")))throw new Error("AI ha introdotto un numero non presente nei dati verificati: "+token);}
  return {summary:result.summary,risks:result.risks.filter(x=>typeof x==="string"),catalysts:result.catalysts.filter(x=>typeof x==="string"),missingData:result.missingData.filter(x=>typeof x==="string"),disclaimer:"Interpretazione automatizzata: non è una raccomandazione personalizzata."};
}
export async function requestGeminiInterpretation({apiKey,verifiedFacts,fetchImpl=fetch}) {
  const model="gemini-3.5-flash-lite";
  if(!apiKey) throw new Error("Chiave Gemini non configurata");
  const prompt="Interpreta esclusivamente i dati JSON verificati forniti. Non inventare numeri, date, consensus, fonti o eventi. Se un dato manca, scrivi missingData. Non calcolare metriche. Restituisci JSON con summary (string), risks (array string), catalysts (array string), missingData (array string). Dati: "+JSON.stringify(verifiedFacts);
  const url="https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent";
  const response=await fetchImpl(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})});
  if(!response.ok) throw new Error("Gemini HTTP "+response.status);
  const json=await response.json();
  const text=json.candidates?.[0]?.content?.parts?.map(p=>p.text??"").join("");
  if(!text) throw new Error("Risposta Gemini vuota");
  return validateAiInterpretation(JSON.parse(text),verifiedFacts);
}
