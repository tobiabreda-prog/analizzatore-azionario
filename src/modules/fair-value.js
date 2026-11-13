import { dcfValue } from "../core/finance-math.js";

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clampProbability = (v) => Math.max(0, Math.min(1, v));

/**
 * DCF scenario valuation. Cash flows, net debt and diluted shares must use
 * consistent units/currency. Growth and WACC are decimals (e.g. 0.08).
 */
export function valueScenarios({ scenarios, netDebt, dilutedShares, currentPrice = null } = {}) {
  if (!Array.isArray(scenarios) || scenarios.length !== 3) throw new Error("Servono esattamente tre scenari Bear, Base e Bull");
  if (!finite(netDebt) || !finite(dilutedShares) || dilutedShares <= 0) throw new Error("Debito netto e azioni diluite devono essere numeri validi");
  const names = new Set(scenarios.map((s) => s.name));
  if (!["bear","base","bull"].every((name) => names.has(name))) throw new Error("Gli scenari richiesti sono bear, base e bull");
  const results = scenarios.map((s) => {
    if (!Array.isArray(s.freeCashFlows) || s.freeCashFlows.length < 3 || !s.freeCashFlows.every(finite) || s.freeCashFlows.at(-1) <= 0) {
      throw new Error("Ogni scenario richiede almeno 3 FCF previsionali e un FCF terminale positivo");
    }
    if (!finite(s.probability) || s.probability < 0) throw new Error("Probabilità scenario non valida");
    const dcf = dcfValue({ freeCashFlows:s.freeCashFlows, wacc:s.wacc, terminalGrowth:s.terminalGrowth, netDebt, dilutedShares });
    if (!dcf.ok) throw new Error(s.name + ": " + dcf.reason);
    return { name:s.name, probability:clampProbability(s.probability), ...dcf };
  });
  const probabilitySum = results.reduce((sum,s)=>sum+s.probability,0);
  if (Math.abs(probabilitySum-1)>0.001) throw new Error("Le probabilità Bear/Base/Bull devono sommare a 100%");
  const weightedFairValue = results.reduce((sum,s)=>sum+s.valuePerShare*s.probability,0);
  const marginOfSafety = finite(currentPrice)&&currentPrice>0 ? weightedFairValue/currentPrice-1 : null;
  return { scenarios:results, weightedFairValue, currentPrice:finite(currentPrice)?currentPrice:null, marginOfSafety, currency:null, assumptionsRequired:true, methodology:"DCF multi-scenario; output sensibile a FCF, WACC, crescita terminale e azioni diluite" };
}
