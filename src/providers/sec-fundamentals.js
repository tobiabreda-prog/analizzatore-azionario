const PRIORITY={
 revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet"],
 netIncome:["NetIncomeLoss","ProfitLoss"],
 dilutedEps:["EarningsPerShareDiluted"],
 operatingCashFlow:["NetCashProvidedByUsedInOperatingActivities"],
 capex:["PaymentsToAcquirePropertyPlantAndEquipment"],
 cash:["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
 sharesDiluted:["WeightedAverageNumberOfDilutedSharesOutstanding"]
};
const DEBT_CURRENT=["LongTermDebtAndFinanceLeaseObligationsCurrent","LongTermDebtCurrent"];
const DEBT_NONCURRENT=["LongTermDebtAndFinanceLeaseObligationsNoncurrent","LongTermDebtNoncurrent"];
function allConcepts(facts){return facts?.facts?.["us-gaap"]??{};}
function chooseUnit(concept){const units=concept?.units??{};return units.USD?"USD":units.shares?"shares":units["USD / shares"]?"USD / shares":Object.keys(units)[0]??null;}
function latest(concepts,tags){
 for(const tag of tags){const concept=concepts[tag];if(!concept)continue;const unit=chooseUnit(concept);if(!unit)continue;
  const rows=(concept.units[unit]??[]).filter(x=>(x.form==="10-K"||x.form==="10-Q")&&x.filed&&x.end&&Number.isFinite(Number(x.val))).sort((a,b)=>b.filed.localeCompare(a.filed));
  if(rows.length)return {tag,unit,...rows[0]};
 }
 return null;
}
function expose(row){return row?{value:row.val,unit:row.unit,periodEnd:row.end,filingDate:row.filed,form:row.form,fy:row.fy,fp:row.fp,accession:row.acc,source:"SEC EDGAR CompanyFacts"}:null;}
export function extractLatestSecMetrics(companyFacts){
 const concepts=allConcepts(companyFacts),result={entity:companyFacts?.entityName??null,source:"SEC EDGAR CompanyFacts",metrics:{},limitations:["Mappatura iniziale US-GAAP: non copre tutti gli emittenti o tassonomie custom","Valori annuali e trimestrali vanno distinti per form e durata del periodo","Debito totale include qui solo debito finanziario a lungo termine corrente e non corrente, non necessariamente tutto il debito a breve","Non sostituisce la riconciliazione del bilancio completo"]};
 for(const [metric,tags] of Object.entries(PRIORITY))result.metrics[metric]=expose(latest(concepts,tags));
 const current=latest(concepts,DEBT_CURRENT),noncurrent=latest(concepts,DEBT_NONCURRENT);
 result.metrics.totalDebt=current&&noncurrent&&current.end===noncurrent.end&&current.filed===noncurrent.filed&&current.unit===noncurrent.unit
  ?{value:Number(current.val)+Number(noncurrent.val),unit:current.unit,periodEnd:current.end,filingDate:current.filed,form:current.form,source:"SEC EDGAR CompanyFacts",components:[current.tag,noncurrent.tag]}
  :null;
 return result;
}
