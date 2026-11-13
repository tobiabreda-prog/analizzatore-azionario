import { annualizedVolatility, maxDrawdown } from "../modules/technical-indicators.js";
const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
export function analyzeRisk({returns=[],equityCurve=[],riskFreeRate=0,periodsPerYear=252}={}) {
  if(!finite(riskFreeRate)||!finite(periodsPerYear)||periodsPerYear<=0) throw new Error("Parametri rischio non validi");
  const valid=returns.filter(finite);
  if(valid.length<2) return {status:"insufficient_data",observations:valid.length,volatility:null,sharpe:null,sortino:null,maxDrawdown:maxDrawdown(equityCurve)};
  const mean=valid.reduce((a,b)=>a+b,0)/valid.length;
  const vol=annualizedVolatility(valid,periodsPerYear);
  const downside=valid.filter(x=>x<0).map(x=>Math.min(x,0));
  const downsideDev=downside.length?Math.sqrt(downside.reduce((a,b)=>a+b*b,0)/valid.length*periodsPerYear):0;
  const annualExcess=mean*periodsPerYear-riskFreeRate;
  return {status:"ok",observations:valid.length,volatility:vol,sharpe:vol?annualExcess/vol:null,sortino:downsideDev?annualExcess/downsideDev:null,maxDrawdown:maxDrawdown(equityCurve)};
}
