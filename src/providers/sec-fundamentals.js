const PRIORITY={
 revenue:["RevenueFromContractWithCustomerExcludingAssessedTax","Revenues","SalesRevenueNet"],
 netIncome:["NetIncomeLoss","ProfitLoss"],
 dilutedEps:["EarningsPerShareDiluted"],
 operatingCashFlow:["NetCashProvidedByUsedInOperatingActivities"],
 capex:["PaymentsToAcquirePropertyPlantAndEquipment"],
 cash:["CashAndCashEquivalentsAtCarryingValue","CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
 totalDebt:["LongTermDebtAndFinanceLeaseObligationsCurrent","LongTermDebtCurrent","LongTermDebtAndFinanceLeaseObligationsNoncurrent","LongTermDebtNoncurrent"],
 sharesDiluted:["WeightedAverageNumberOfDilutedSharesOutstanding"]
};
function allConcepts(facts){return facts?.facts?.["us-gaap"]??{};}
function chooseUnit(concept){const units=concept?.units??{};return units.USD?"USD":units.shares?"shares":units["USD / shares"]?"USD / shares":Object.keys(units)[0]??null;}
export function extractLatestSecMetrics(companyFacts){
 const concepts=allConcepts(companyFacts),result={entity:companyFacts?.entityName??null,source:"SEC EDGAR CompanyFacts",metrics:{},limitations:["Mappatura iniziale US-GAAP: non copre tutti gli emittenti o tassonomie custom","Valori annuali e trimestrali vanno distinti per form e durata del periodo","Non sostituisce la riconciliazione del bilancio completo"]};
 for(const [metric,tags] of Object.entries(PRIORITY)){
  let selected=null;
  for(const tag of tags){const concept=concepts[tag];if(!concept)continue;const unit=chooseUnit(concept);if(!unit)continue;
   const rows=(concept.units[unit]??[]).filter(x=>x.form==="10-K"||x.form==="10-Q").filter(x=>x.filed&&x.end&&Number.isFinite(Number(x.val))).sort((a,b)=>b.filed.localeCompare(a.filed));
   if(rows.length){selected={tag,unit,...rows[0]};break;}
  }
  result.metrics[metric]=selected?{value:selected.val,unit:selected.unit,periodEnd:selected.end,filingDate:selected.filed,form:selected.form,fy:selected.fy,fp:selected.fp,accession:selected.acc,source:"SEC EDGAR CompanyFacts"}:null;
 }
 return result;
}
